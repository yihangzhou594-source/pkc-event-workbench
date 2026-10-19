/**
 * 导播台与 OBS 场景页的路由 / 状态 API。
 *
 * 单独成模块，server.mjs 只插入一次委托调用，尽量不动既有代码。
 *
 * 端点：
 *   GET  /director                  导播台页面
 *   GET  /obs/<场景>                 OBS 浏览器源页面（透明背景）
 *   GET  /api/director/state         当前快照 + 场景清单
 *   GET  /api/director/stream        SSE 事件流（替代轮询）
 *   POST /api/director/scene         { id }                切换预览场景
 *   POST /api/director/settings      { id, patch }         改某场景设置
 *   POST /api/director/push          推送到直播端
 *   POST /api/director/discard       丢弃预览改动
 *   POST /api/director/countdown     { patch }             现场通道
 *   POST /api/director/bp            { snapshot|null }     现场通道
 *   POST /api/director/chart         { data|null }         现场通道
 *   POST /api/director/chart/playlist { patch }            数据图轮播设置 / 推六张
 *   POST /api/director/chart/step     { dir }               上一张 / 下一张
 *   POST /api/director/context      { seriesId, matchKey, gameId, ... }  现场通道
 *   POST /api/director/bracket       { snapshot, change }  现场通道（赛程图实时落位）
 *   POST /api/director/bracket/replay                      重播最近一次落位动画
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../bp-core/src/store.js';
import { SCENES, SceneId, isSceneId } from '../bp-core/src/scenes.js';
import {
  createGame, lock as bpLock, undo as bpUndo, redo as bpRedo,
  resetGame as bpReset, snapshot as bpSnapshot, normalizeConfig,
} from '../bp-core/src/machine.js';
import { buildSequence } from '../bp-core/src/sequence.js';
import { resolveRuleLines, ruleTitle } from '../bp-core/src/rulesText.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DIR);
const DIRECTOR_PAGE = path.join(DIR, 'console.html');
const OBS_PAGE = path.join(DIR, 'obs.html');
const TEAMS_FILE = path.join(ROOT, '数据', 'teams.json');
const GENERATOR_PAGE = path.join(ROOT, 'PKC赛后数据图生成器.html');

const store = createStore();

/**
 * 倒计时推进：服务端每秒走一格，导播台与 OBS 页面看到的是同一个时间。
 * 只存 `remainingMs`，每次按真实经过时间扣减，避免长跑漂移。
 */
let cdLast = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - cdLast;
  cdLast = now;
  const cd = store.snapshot().live.countdown;
  if (!cd || !cd.running) return;
  const left = Math.max(0, (cd.remainingMs || 0) - dt);
  store.setCountdown({ remainingMs: Math.round(left), running: left > 0 });
}, 1000).unref?.();

/* 数据图轮播：服务端权威推进，导播预览与 OBS 看到同一张。 */
setInterval(() => {
  const p = store.snapshot().live.chartPlaylist;
  if (!p || !p.running || !Array.isArray(p.items) || p.items.length < 2) return;
  if (Date.now() - (p.startedAt || 0) >= p.intervalMs) store.stepChartPlaylist(1);
}, 500).unref?.();

/* ---------- BP 现场会话（服务端权威状态） ---------- */

let bpGame = null;
let bpConfig = normalizeConfig({ banCount: 5, globalBp: true, peakDuel: true, boFormat: 7 });
let bpTeams = { blue: '', red: '' };

/** 每次变更后写入现场通道，OBS 端据此重绘。 */
function syncBp() {
  if (!bpGame) return store.setBp(null);
  const cfg = bpGame.config;
  store.setBp({
    config: cfg,
    teams: bpTeams,
    ruleTitle: ruleTitle(cfg),
    ruleLines: resolveRuleLines(cfg),
    ...bpSnapshot(bpGame),
  });
  return null;
}

/* ---------- 队伍名单持久化 ---------- */

function readTeams() {
  const stored = readStoredTeams();
  /* 生成器的队伍库里另有一整套战队与名单。这里把它并进来兜底，
     省得同一份名单要在两处各录一遍；`数据/teams.json` 里已有的队优先
     （那份带真实姓名与队徽，是给板面用的精细版）。 */
  const names = new Set(stored.map((t) => t.name));
  for (const t of readLibraryTeams()) {
    if (!t.name || names.has(t.name)) continue;
    names.add(t.name);
    stored.push({
      id: String(t.id || `lib_${stored.length}`),
      name: String(t.name),
      logo: "",
      players: (t.players || []).slice(0, 12).map((p, i) => ({
        name: String(p == null ? "" : p).trim(),
        realName: "",
        lane: LANE_ORDER[i] || "",
      })),
    });
  }
  return stored;
}

function readStoredTeams() {
  try {
    const raw = fs.readFileSync(TEAMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.teams) ? parsed.teams : [];
  } catch {
    return [];
  }
}

/** 生成器队伍库（数据/library.json）里当前系列赛的战队，只取队名与名单。 */
function readLibraryTeams() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '数据', 'library.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const series = (parsed?.series || []);
    if (!series.length) return [];
    const cur = series.find((s) => s.id === parsed.currentId) || series[0];
    return (cur?.teams || []).map((t) => ({ id: t.id, name: t.name, logo: t.logo, players: t.players || [] }));
  } catch {
    return [];
  }
}

function writeTeams(teams) {
  fs.mkdirSync(path.dirname(TEAMS_FILE), { recursive: true });
  fs.writeFileSync(TEAMS_FILE, JSON.stringify({ teams, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

/** 规范化一支队伍：保留名称、队徽与五名选手；分路缺省时按位置补齐。 */
const LANE_ORDER = ['对抗路', '打野', '中路', '发育路', '游走'];

function normalizeTeam(input) {
  const name = String(input?.name ?? '').trim();
  if (!name) throw new Error('队伍名称不能为空');
  const raw = Array.isArray(input?.players) ? input.players : [];
  const players = raw.slice(0, 5).map((p, i) => ({
    name: String(p?.name ?? '').trim(),
    realName: String(p?.realName ?? '').trim(),
    lane: LANE_ORDER.includes(p?.lane) ? p.lane : LANE_ORDER[i] ?? '',
  }));
  return {
    id: String(input?.id ?? '').trim() || `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    logo: String(input?.logo ?? '').trim(),
    players,
  };
}

/** SSE 订阅者 */
const streams = new Set();

store.subscribe((payload) => {
  // 必须带上 scenes：前端渲染场景列时要读它，缺了会直接抛错。
  const data = `event: ${payload.channel}\ndata: ${JSON.stringify({ ...payload.state, scenes: sceneList() })}\n\n`;
  for (const res of streams) {
    try { res.write(data); } catch { streams.delete(res); }
  }
});

function sceneList() {
  return SCENES.map((s) => ({ id: s.id, label: s.label, obsPath: s.obsPath }));
}

/** 主进程退出时清理长连接，避免端口占用。 */
export function closeDirectorStreams() {
  for (const res of streams) { try { res.end(); } catch { /* ignore */ } }
  streams.clear();
}

function streamApi(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // hello 是前端初始化的主要来源，必须与广播使用同一份完整载荷。
  res.write(`event: hello\ndata: ${JSON.stringify({ ...store.snapshot(), scenes: sceneList() })}\n\n`);
  streams.add(res);
  // 心跳：防止代理或浏览器静默断开
  const beat = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { /* ignore */ }
  }, 15000);
  res.on('close', () => {
    clearInterval(beat);
    streams.delete(res);
  });
}

function stateBody() {
  return {
    ...store.snapshot(),
    scenes: sceneList(),
  };
}

/**
 * @returns {Promise<boolean>} 是否已处理该请求
 */
export async function handleDirector(req, res, url, helpers) {
  const { sendJSON, readBody, serveFile } = helpers;
  const p = url.pathname;

  /* ---------- 页面 ---------- */
  /* 这两个页面是现场一直在调的对象，别让浏览器缓存住旧版 */
  if (p === '/director' || p === '/director/') return serveFile(res, DIRECTOR_PAGE, { 'Cache-Control': 'no-store' }), true;
  if (p === '/obs' || p.startsWith('/obs/')) return serveFile(res, OBS_PAGE, { 'Cache-Control': 'no-store' }), true;

  /**
   * 生成器原样提供（iframe 内嵌用），不修改其任何脚本。
   * bare=1 时仅注入一条样式隐藏它自带的标签栏 —— 那部分已由外壳侧栏取代。
   */
  if (p === '/generator') {
    try {
      let html = fs.readFileSync(GENERATOR_PAGE, 'utf8');
      if (url.searchParams.get('bare') === '1') {
        html = html.replace('</head>',
          '<style>.tabs{display:none !important}.topbar{display:none !important}'
          + '.contextbar{top:0 !important}.subnav{top:96px !important}</style>'
          + '<link rel="stylesheet" href="/assets/embed-theme.css" /></head>');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch (err) {
      sendJSON(res, { error: 'generator_unavailable', message: err.message }, 500);
    }
    return true;
  }

  /* ---------- 读状态 ---------- */
  if (p === '/api/director/state' && req.method === 'GET') {
    return sendJSON(res, stateBody()), true;
  }

  /* ---------- SSE ---------- */
  if (p === '/api/director/stream' && req.method === 'GET') {
    streamApi(res);
    return true;
  }

  /* ---------- 队伍名单 ---------- */
  if (p === '/api/director/teams') {
    if (req.method === 'GET') return sendJSON(res, { teams: readTeams() }), true;
    if (req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const incoming = Array.isArray(body?.teams) ? body.teams : [];
        const teams = incoming.map(normalizeTeam);
        writeTeams(teams);
        return sendJSON(res, { teams }), true;
      } catch (err) {
        return sendJSON(res, { error: 'invalid_teams', message: err.message }, 400), true;
      }
    }
  }

  if (!p.startsWith('/api/director/')) return false;

  /* ---------- 写操作 ---------- */
  const action = p.slice('/api/director/'.length);
  let body = {};
  if (req.method === 'POST') {
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJSON(res, { error: 'invalid_json' }, 400), true;
    }
  }

  try {
    switch (action) {
      case 'scene':
        if (!isSceneId(body.id)) return sendJSON(res, { error: 'unknown_scene' }, 400), true;
        store.setScene(body.id);
        break;
      case 'settings':
        if (!isSceneId(body.id)) return sendJSON(res, { error: 'unknown_scene' }, 400), true;
        store.setSceneSettings(body.id, body.patch ?? {});
        break;
      case 'push':
        store.push();
        break;
      case 'discard':
        store.discardPreview();
        break;
      case 'countdown':
        store.setCountdown(body.patch ?? {});
        break;
      case 'bp':
        store.setBp(body.snapshot ?? null);
        break;
      case 'chart':
        store.setChart(body.data ?? null);
        break;
      case 'chart/playlist':
        store.setChartPlaylist(body.patch ?? body);
        break;
      case 'chart/step':
        store.stepChartPlaylist(Number(body.dir) || 1);
        break;
      case 'context':
        store.setContext(body.context || body);
        break;
      case 'bracket':
        store.setBracket(body ?? {});
        break;
      case 'bracket/replay':
        store.replayBracket();
        break;
      case 'bp/config':
        bpConfig = normalizeConfig({ ...bpConfig, ...(body.patch ?? {}) });
        if (bpGame) { bpGame.config = bpConfig; bpGame.steps = buildSequence(bpConfig); }
        syncBp();
        break;
      case 'bp/start': {
        if (body.teams) bpTeams = { blue: body.teams.blue ?? '', red: body.teams.red ?? '' };
        bpGame = createGame(bpConfig, { carriedOver: body.carriedOver ?? [] });
        syncBp();
        break;
      }
      case 'bp/lock':
        if (!bpGame) return sendJSON(res, { error: 'bp_not_started' }, 400), true;
        bpLock(bpGame, body.heroId ?? null);
        syncBp();
        break;
      case 'bp/undo':
        if (!bpGame) return sendJSON(res, { error: 'bp_not_started' }, 400), true;
        bpUndo(bpGame);
        syncBp();
        break;
      case 'bp/redo':
        if (!bpGame) return sendJSON(res, { error: 'bp_not_started' }, 400), true;
        bpRedo(bpGame);
        syncBp();
        break;
      case 'bp/reset':
        if (bpGame) bpReset(bpGame);
        syncBp();
        break;
      case 'bp/end':
        bpGame = null;
        syncBp();
        break;
      default:
        return sendJSON(res, { error: 'unknown_action', action }, 404), true;
    }
  } catch (err) {
    return sendJSON(res, { error: err.code || 'error', message: err.message }, 400), true;
  }

  return sendJSON(res, stateBody()), true;
}

/* ---------- 赛程图初始快照 ----------
 * OBS 的「赛程图」场景可能在导播打开淘汰赛页面之前就上线；
 * 服务启动时先把 数据/library.json 的当前系列 + 数据/bracket.json 读进 live，
 * 避免抽签开始前画面是空的。之后生成器每次改动都会覆盖这份快照。
 */
function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function seedBracketFromDisk() {
  const lib = readJsonSafe(path.join(ROOT, '数据', 'library.json'));
  const brackets = readJsonSafe(path.join(ROOT, '数据', 'bracket.json'));
  const series = lib && Array.isArray(lib.series)
    ? (lib.series.find((s) => s.id === lib.currentId) || lib.series[0])
    : null;
  if (!series) return;
  const br = brackets && (brackets[series.id] || brackets[lib.currentId]);
  if (!br) return;
  store.setBracket({
    snapshot: {
      seriesId: series.id,
      title: br.title === undefined ? series.name : br.title,
      short: br.short || 'PKC',
      note: br.note || '',
      groups: br.groups || {},
      draw: br.draw || [],
      win: br.win || {},
      score: br.score || {},
      teams: (series.teams || []).map((t) => ({
        id: t.id, name: t.name, color: t.color || '', group: t.group || '',
      })),
    },
    change: null,
  });
}
seedBracketFromDisk();

function seedContextFromDisk() {
  const ctx = readJsonSafe(path.join(ROOT, '数据', 'context.json'));
  if (ctx && ctx.seriesId) store.setContext(ctx);
}
seedContextFromDisk();

export { SceneId, SCENES };

