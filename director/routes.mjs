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
import {
  currentSeriesId, listCompetitionTeams, replaceCompetitionTeams,
  toDirectorTeams, fromDirectorTeams, previewLegacyTeams, importLegacyTeams,
} from '../lib/competition-teams.mjs';
import { readCompetitionContext, saveCompetitionContext } from '../lib/competition-context.mjs';
import { buildProductionReadiness } from '../lib/production-readiness.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DIR);
const DATA_DIR = process.env.PKC_DATA_DIR ? path.resolve(process.env.PKC_DATA_DIR) : path.join(ROOT, '数据');
const DIRECTOR_PAGE = path.join(DIR, 'console.html');
const OBS_PAGE = path.join(DIR, 'obs.html');
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

setInterval(() => {
  const p = store.snapshot().live.spotlightPlaylist;
  if (!p?.running || !Array.isArray(p.items) || p.items.filter((x) => x.blue?.player && x.red?.player).length < 2) return;
  if (Date.now() - (p.startedAt || 0) >= p.intervalMs) store.stepSpotlightPlaylist(1);
}, 500).unref?.();

let tencentHeroesCache = { expires: 0, heroes: null };
async function getTencentHeroes() {
  if (tencentHeroesCache.heroes && Date.now() < tencentHeroesCache.expires) return tencentHeroesCache.heroes;
  const response = await fetch('https://pvp.qq.com/web201605/js/herolist.json', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('腾讯英雄目录暂不可用');
  const raw = await response.json();
  const heroes = raw.map((h) => ({ id: String(h.ename), name: String(h.cname || '') })).filter((h) => /^\d+$/.test(h.id) && h.name);
  tencentHeroesCache = { heroes, expires: Date.now() + 6 * 60 * 60 * 1000 };
  return heroes;
}

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

export function remoteDirectorState() {
  const snapshot = store.snapshot();
  return {
    onAir: { scene: snapshot.onAir.scene, revision: snapshot.onAir.revision },
    preview: { scene: snapshot.preview.scene, revision: snapshot.preview.revision },
    isPreviewDirty: snapshot.isPreviewDirty,
    canUndoPush: snapshot.canUndoPush,
    lastPush: snapshot.lastPush,
    live: { context: snapshot.live.context || null },
    scenes: sceneList(),
    readiness: readinessBody(),
  };
}

export function setDirectorContext(context) {
  store.setContext(context || null);
}

function pushPreview(force = false) {
  const snapshot = store.snapshot();
  const readiness = readinessBody();
  const selected = readiness.scenes.find((item) => item.id === snapshot.preview.scene);
  if (!force && snapshot.preview.scene === SceneId.BLANK && snapshot.onAir.scene !== SceneId.BLANK) {
    return {
      status: 409,
      body: {
        error: "blank_confirm_required",
        message: "当前推送会把直播画面切为空白，请确认后再继续。",
      },
    };
  }
  if (!force && selected?.status === "blocked") {
    return {
      status: 409,
      body: {
        error: "readiness_blocked",
        message: selected.blockers?.[0]?.label || selected.summary,
        readiness,
      },
    };
  }
  store.push({ force });
  return { status: 200, body: remoteDirectorState() };
}

export function remoteDirectorAction(body = {}) {
  const action = String(body.action || "");
  if (action === "select-scene") {
    if (!isSceneId(body.scene)) return { status: 400, body: { error: "unknown_scene" } };
    if (body.scene === SceneId.BLANK) return { status: 400, body: { error: "blank_requires_hold" } };
    store.setScene(body.scene);
    return { status: 200, body: remoteDirectorState() };
  }
  if (action === "push") return pushPreview(body.force === true);
  if (action === "undo-push") {
    store.undoPush();
    return { status: 200, body: remoteDirectorState() };
  }
  if (action === "blank") {
    store.setScene(SceneId.BLANK);
    return pushPreview(true);
  }
  return { status: 400, body: { error: "unknown_remote_action" } };
}

export function directorStreamApi(res) {
  streamApi(res);
}

function readinessBody() {
  const library = readJsonSafe(path.join(DATA_DIR, 'library.json'));
  const matches = readJsonSafe(path.join(DATA_DIR, 'matches.json'));
  const bracket = readJsonSafe(path.join(DATA_DIR, 'bracket.json'));
  const context = store.snapshot().live.context || readCompetitionContext().context;
  return buildProductionReadiness({ library, matches, bracket, context });
}

function bracketEliminatedIds(bracket) {
  const eliminated = new Set();
  if (!bracket || typeof bracket !== 'object') return eliminated;
  const wins = bracket.win || {};
  const matches = new Map();
  const winner = (key) => {
    const match = matches.get(key), side = wins[key];
    return match && (side === 'a' || side === 'b') ? match[side] : '';
  };
  const loser = (key) => {
    const match = matches.get(key), side = wins[key];
    return match && (side === 'a' || side === 'b') ? match[side === 'a' ? 'b' : 'a'] : '';
  };
  const add = (key, round, a, b) => matches.set(key, { key, round, a, b });
  const draw = Array.isArray(bracket.draw) ? bracket.draw : [];
  for (let i = 0; i < 8; i++) add(`R16-${i + 1}`, 'r16', draw[i]?.a || '', draw[i]?.b || '');
  add('WB1-1', 'wb1', winner('R16-1'), winner('R16-2'));
  add('WB1-2', 'wb1', winner('R16-3'), winner('R16-4'));
  add('WB1-3', 'wb1', winner('R16-5'), winner('R16-6'));
  add('WB1-4', 'wb1', winner('R16-7'), winner('R16-8'));
  add('WB2-1', 'wb2', winner('WB1-1'), winner('WB1-2'));
  add('WB2-2', 'wb2', winner('WB1-3'), winner('WB1-4'));
  add('WBF', 'wbf', winner('WB2-1'), winner('WB2-2'));
  add('LB1-1', 'lb1', loser('WB1-1'), loser('WB1-2'));
  add('LB1-2', 'lb1', loser('WB1-3'), loser('WB1-4'));
  add('LB2-1', 'lb2', winner('LB1-1'), loser('WB2-1'));
  add('LB2-2', 'lb2', winner('LB1-2'), loser('WB2-2'));
  add('LB3', 'lb3', winner('LB2-1'), winner('LB2-2'));
  add('LBF', 'lbf', winner('LB3'), loser('WBF'));
  add('GF', 'gf', winner('WBF'), winner('LBF'));
  add('GF2', 'gf2', winner('GF'), loser('GF'));
  const losses = new Map();
  const reset = wins.GF === 'b';
  for (const match of matches.values()) {
    const side = wins[match.key];
    if (!match.a || !match.b || (side !== 'a' && side !== 'b')) continue;
    const defeated = match[side === 'a' ? 'b' : 'a'];
    if (!defeated) continue;
    losses.set(defeated, (losses.get(defeated) || 0) + 1);
    if (match.round === 'r16' || match.round === 'lbf' || match.round === 'gf2'
      || (match.round === 'gf' && !reset)) eliminated.add(defeated);
  }
  for (const [teamId, count] of losses) if (count >= 2) eliminated.add(teamId);
  return eliminated;
}

function withTeamAvailability(teams, seriesId) {
  const snapshot = store.snapshot();
  let bracket = snapshot.live.bracket?.seriesId === seriesId ? snapshot.live.bracket : null;
  if (!bracket) {
    const saved = readJsonSafe(path.join(DATA_DIR, 'bracket.json'));
    bracket = saved && (saved[seriesId] || null);
  }
  const out = bracketEliminatedIds(bracket);
  return teams.map((team) => ({
    ...team,
    eliminatedByResults: out.has(team.id),
    availableForSelection: !team.eliminated && !out.has(team.id),
  }));
}

function persistContext(candidate, revision, opts) {
  const result = saveCompetitionContext(candidate, revision, opts);
  if (!result.conflict) store.setContext(result.context);
  return result;
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
   * bare=1 时只隐藏外壳已接管的主导航与预览按钮，保留数据工具栏和状态提示。
   */
  if (p === '/generator') {
    try {
      let html = fs.readFileSync(GENERATOR_PAGE, 'utf8');
      if (url.searchParams.get('bare') === '1') {
        html = html.replace('<body>', '<body class="pkc-embed-mode">');
        html = html.replace('</head>',
          '<style id="pkcEmbedMode">.pkc-embed-mode .tabs{display:none !important}'
          + '.pkc-embed-mode .topbar .brand,.pkc-embed-mode .topbar .appnav,'
          + '.pkc-embed-mode #btnPreviewToggle{display:none !important}</style>'
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
  if (p === '/api/director/readiness' && req.method === 'GET') {
    return sendJSON(res, readinessBody()), true;
  }
  if (p === '/api/tencent-heroes' && req.method === 'GET') {
    try { return sendJSON(res, { heroes: await getTencentHeroes() }), true; }
    catch (err) { return sendJSON(res, { error: 'tencent_catalog_unavailable', message: err.message }, 503), true; }
  }
  const heroImageMatch = p.match(/^\/tencent-hero\/(\d+)$/);
  if (heroImageMatch && req.method === 'GET') {
    try {
      const id = heroImageMatch[1];
      if (!(await getTencentHeroes()).some((h) => h.id === id)) return sendJSON(res, { error: 'unknown_hero' }, 404), true;
      const upstream = await fetch(`https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${id}/${id}-mobileskin-1.jpg`, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) return sendJSON(res, { error: 'hero_image_unavailable' }, 502), true;
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=3600' }); res.end(bytes);
    } catch { sendJSON(res, { error: 'hero_image_unavailable' }, 502); }
    return true;
  }

  /* ---------- SSE ---------- */
  if (p === '/api/director/stream' && req.method === 'GET') {
    streamApi(res);
    return true;
  }

  /* ---------- 规范队伍 API 与显式迁移 ---------- */
  if (p === '/api/competition/teams' && (req.method === 'GET' || req.method === 'PUT')) {
    try {
      const seriesId = url.searchParams.get('seriesId');
      if (req.method === 'GET') {
        const result = listCompetitionTeams(seriesId);
        return sendJSON(res, { ...result, teams: withTeamAvailability(result.teams, seriesId) }), true;
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      return sendJSON(res, replaceCompetitionTeams(seriesId, body.teams, body.revision)), true;
    } catch (err) {
      if (err.code === 'team_revision_conflict') {
        return sendJSON(res, { error: err.code, message: err.message, revision: err.revision }, 409), true;
      }
      const status = err.code === 'series_not_found' ? 404
        : ['series_id_required', 'team_revision_required', 'invalid_teams', 'duplicate_team_id'].includes(err.code) ? 400 : 500;
      return sendJSON(res, { error: err.code || 'invalid_teams', message: err.message }, status), true;
    }
  }
  if (p === '/api/competition/teams/migration-preview' && req.method === 'GET') {
    try { return sendJSON(res, previewLegacyTeams()), true; }
    catch (err) { return sendJSON(res, { error: err.code || 'migration_preview_failed', message: err.message }, 500), true; }
  }
  if (p === '/api/competition/teams/import' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      return sendJSON(res, importLegacyTeams(body)), true;
    } catch (err) {
      const status = err.code === 'series_not_found' ? 404
        : ['confirmation_required', 'series_id_required'].includes(err.code) ? 400 : 500;
      return sendJSON(res, { error: err.code || 'migration_failed', message: err.message }, status), true;
    }
  }

  /* ---------- 规范上下文 API ---------- */
  if (p === '/api/competition/context' && req.method === 'GET') {
    return sendJSON(res, readCompetitionContext()), true;
  }
  if (p === '/api/competition/context' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = persistContext(body.context, body.revision);
      if (result.conflict) return sendJSON(res, { error: 'context_conflict', context: result.context, revision: result.revision }, 409), true;
      return sendJSON(res, result), true;
    } catch (err) {
      const status = ['series_not_found', 'game_not_found', 'match_not_found', 'team_not_found'].includes(err.code) ? 404
        : ['revision_required', 'series_id_required', 'invalid_context', 'invalid_teams'].includes(err.code) ? 400 : 500;
      return sendJSON(res, { error: err.code || 'context_save_failed', message: err.message }, status), true;
    }
  }
  /* 旧通用 context URL 也必须经过同一服务，避免绕开 revision、落盘和 SSE。 */
  if (p === '/api/store/context' && req.method === 'GET') {
    return sendJSON(res, readCompetitionContext().context), true;
  }
  if (p === '/api/store/context' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || 'null');
      const revision = body && typeof body === 'object' ? body.revision : undefined;
      const result = persistContext(body, revision, { allowLegacy: !Number.isFinite(Number(revision)) });
      if (result.conflict) return sendJSON(res, { error: 'context_conflict', context: result.context, revision: result.revision }, 409), true;
      return sendJSON(res, { ok: true, context: result.context, revision: result.revision }), true;
    } catch (err) {
      const status = ['series_not_found', 'game_not_found', 'match_not_found', 'team_not_found'].includes(err.code) ? 404
        : ['revision_required', 'series_id_required', 'invalid_context', 'invalid_teams'].includes(err.code) ? 400 : 500;
      return sendJSON(res, { error: err.code || 'context_save_failed', message: err.message }, status), true;
    }
  }

  /* ---------- 旧队伍 API 适配器：library.json 仍是唯一写入来源 ---------- */
  if (p === '/api/director/teams') {
    const contextSeriesId = store.snapshot().live.context?.seriesId;
    const seriesId = contextSeriesId || currentSeriesId();
    if (req.method === 'GET') {
      const result = listCompetitionTeams(seriesId);
      return sendJSON(res, { teams: toDirectorTeams(withTeamAvailability(result.teams, seriesId)), seriesId, revision: result.revision }), true;
    }
    if (req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const incoming = Array.isArray(body?.teams) ? body.teams : [];
        const result = replaceCompetitionTeams(seriesId, fromDirectorTeams(incoming), body.revision);
        const teams = toDirectorTeams(result.teams);
        return sendJSON(res, { teams, seriesId, revision: result.revision }), true;
      } catch (err) {
        if (err.code === 'team_revision_conflict') {
          return sendJSON(res, { error: err.code, message: err.message, revision: err.revision }, 409), true;
        }
        const status = ['series_not_found', 'game_not_found', 'match_not_found', 'team_not_found'].includes(err.code) ? 404
          : ['series_id_required', 'team_revision_required', 'invalid_teams', 'duplicate_team_id'].includes(err.code) ? 400 : 500;
        return sendJSON(res, { error: err.code || 'invalid_teams', message: err.message }, status), true;
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
        {
          const pushed = pushPreview(body.force === true);
          if (pushed.status !== 200) return sendJSON(res, pushed.body, pushed.status), true;
        }
        break;
      case 'undo-push':
        store.undoPush();
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
      case 'spotlight/playlist':
        store.setSpotlightPlaylist(body.patch ?? body);
        break;
      case 'spotlight/step':
        store.stepSpotlightPlaylist(Number(body.dir) || 1);
        break;
      case 'context':
        {
          const context = body.context || body;
          const revision = body.revision ?? context.revision;
          const result = persistContext(context, revision, { allowLegacy: !Number.isFinite(Number(revision)) });
          if (result.conflict) return sendJSON(res, { error: 'context_conflict', context: result.context, revision: result.revision }, 409), true;
        }
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
    const status = ['series_not_found', 'game_not_found', 'match_not_found', 'team_not_found'].includes(err.code) ? 404
      : ['revision_required', 'series_id_required', 'invalid_context', 'invalid_teams', 'unknown_scene'].includes(err.code) ? 400 : 500;
    return sendJSON(res, { error: err.code || 'error', message: err.message }, status), true;
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
  const lib = readJsonSafe(path.join(DATA_DIR, 'library.json'));
  const brackets = readJsonSafe(path.join(DATA_DIR, 'bracket.json'));
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
  const ctx = readCompetitionContext().context;
  if (ctx && ctx.seriesId) store.setContext(ctx);
}
seedContextFromDisk();

export { SceneId, SCENES };

