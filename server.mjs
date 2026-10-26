/**
 * PKC 赛后数据图生成器 · 本地服务
 * - 托管页面与素材（英雄图 / 缩略图 / OCR 引擎）
 * - 扫描英雄素材，提供英雄 → 图片的匹配索引
 * - 按系列赛持久化：队伍库、比赛数据、偏好设置（存到 数据/ 目录的 JSON）
 * 启动：双击 启动.bat，或在本目录执行 node server.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  handleDirector, closeDirectorStreams, remoteDirectorState,
  remoteDirectorAction, directorStreamApi, setDirectorContext,
  refreshDirectorDataFromStore,
} from "./director/routes.mjs";
import { writeJsonAtomic } from "./lib/json-store.mjs";
import { getSharedDataStore } from "./lib/data-store.mjs";
import { aggregateHeroStats, toCSV, addManualGame } from "./lib/hero-stats.mjs";
import { readHeroStats, writeHeroStats } from "./lib/hero-stats-store.mjs";
import {
  applyMatchBans, buildHeroStatsWithMatchData, listMatchGamesForHeroStats,
} from "./lib/hero-stats-sync.mjs";
import { buildGroupSchedule } from "./lib/group-schedule.mjs";
import { buildSeasonInsights } from "./lib/season-insights.mjs";
import { createRemoteControl, RemoteControlError } from "./lib/remote-control.mjs";
import { isLoopbackAddress, remoteRequestAllowed } from "./lib/remote-access-policy.mjs";
import {
  buildRemoteMatchContext, mergeRemoteDraft, buildRemoteGame, validateRemoteDraft,
} from "./lib/remote-match-data.mjs";
import { readCompetitionContext, saveCompetitionContext } from "./lib/competition-context.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.env.PKC_PORT || 8971);
const REMOTE_MODE = process.env.PKC_REMOTE === "1";
const CLOUD_HOSTED = REMOTE_MODE || !!process.env.RENDER || process.env.PKC_CLOUD === "1";
const LISTEN_HOST = CLOUD_HOSTED ? "0.0.0.0" : "127.0.0.1";
const DIR_HERO = path.join(ROOT, "英雄半身像");
const DIR_THUMB = path.join(ROOT, "英雄缩略图");
const DIR_OPT = path.join(ROOT, "英雄优化");
const DIR_HICON = path.join(ROOT, "素材", "_官方头像");
const DIR_DATA = process.env.PKC_DATA_DIR
  ? path.resolve(process.env.PKC_DATA_DIR)
  : path.join(ROOT, "数据");
const DIR_ASSETS = path.join(ROOT, "assets");
const DIR_DOCS = path.join(ROOT, "docs");
const DIR_PREVIEW = path.join(ROOT, "预览");
const APP_PAGE = path.join(ROOT, "director", "console.html");
const REMOTE_PAGE = path.join(ROOT, "director", "remote.html");
const HERO_LIST = path.join(ROOT, "tools", "_herolist.txt");
const AI_CONFIG_FILE = path.join(DIR_DATA, "ai-config.json");
const AI_SECRET_HELPER = path.join(ROOT, "tools", "ai-secret.ps1");
const remoteAccess = createRemoteControl();
const dataStore = getSharedDataStore();

fs.mkdirSync(DIR_DATA, { recursive: true });

function getAIConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8")); } catch { /* env fallback */ }
  let storedKey = "";
  if (cfg.apiKeyEnc) {
    for (const exe of ["pwsh", "powershell"]) {
      try {
        const p = spawnSync(exe, [
          "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", AI_SECRET_HELPER, "unprotect",
        ], { input: String(cfg.apiKeyEnc), encoding: "utf8" });
        if (p.status === 0 && p.stdout) {
          storedKey = String(p.stdout || "").trim();
          break;
        }
      } catch { /* unreadable encrypted key on another Windows user */ }
    }
  }
  return {
    baseUrl: String(cfg.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: String(cfg.model || process.env.DEEPSEEK_MODEL || "deepseek-flash"),
    apiKey: String(process.env.DEEPSEEK_API_KEY || storedKey || cfg.apiKey || ""),
    maxTokens: Number(cfg.maxTokens || 8000),
  };
}

async function callDeepSeekOCR(images, hint) {
  const cfg = getAIConfig();
  if (!cfg.apiKey) throw new Error("未配置 DeepSeek API Key（数据/ai-config.json 或 DEEPSEEK_API_KEY）");
  const prompt = [
    "你是王者荣耀赛后数据图表 OCR 引擎。",
    "输入通常包含装备页和数据页两张截图；第一张是装备页，第二张是数据页。",
    "只输出一个严格 JSON 对象，不要 Markdown，不要解释。",
    '结构：{"blue":[{"name":"","hero":"","k":0,"d":0,"a":0,"gold":0,"dmgRaw":0,"tankRaw":0,"dmgPct":0,"tankPct":0,"goldShare":0,"kp":0}],"red":[...5个...],"duration":""}',
    "按图片从上到下五行读取；蓝方在左，红方在右。",
    "name 和 hero 按图片文字原样读取，不要把昵称和英雄名互换。",
    "gold 使用装备页的具体经济数字；dmgRaw/tankRaw 使用数据页的 33.7k 这类数值展开成整数；dmgPct/tankPct/goldShare/kp 只输出数字，不带 %。",
    "不确定的字段用 null，不要编造。",
    hint ? "用户补充：" + hint : "",
  ].filter(Boolean).join("\n");
  const content = [{ type: "text", text: prompt }];
  images.forEach((img, i) => {
    content.push({ type: "text", text: "第 " + (i + 1) + " 张截图" });
    content.push({ type: "image_url", image_url: { url: img } });
  });
  const res = await fetch(cfg.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content }],
      max_tokens: cfg.maxTokens,
      temperature: 0,
      // OCR 只需要按画面抄录。思考模式会反复推演并耗尽输出 token，
      // 最终只返回 reasoning_content，前端看起来就会一直卡在读取中。
      ...(cfg.model === "deepseek-flash" ? { thinking: { type: "disabled" } } : {}),
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status + ": " + raw.slice(0, 500));
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("DeepSeek 返回格式异常"); }
  const choice = payload.choices && payload.choices[0] ? payload.choices[0] : null;
  let text = choice && choice.message ? choice.message.content : "";
  text = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!text) {
    const reason = choice && choice.finish_reason ? choice.finish_reason : "unknown";
    if (reason === "length") {
      throw new Error("DeepSeek 推理 token 已用尽，未生成最终 JSON；请确认模型已关闭思考模式");
    }
    throw new Error("DeepSeek 没有返回最终 JSON（finish_reason=" + reason + "）");
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("DeepSeek JSON 解析失败：" + text.slice(0, 300)); }
  return { data, usage: payload.usage || null };
}

function protectAISecret(value) {
  for (const exe of ["pwsh", "powershell"]) {
    try {
      const p = spawnSync(exe, [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", AI_SECRET_HELPER, "protect",
      ], { input: String(value || ""), encoding: "utf8" });
      if (p.status === 0 && p.stdout && p.stdout.trim()) return p.stdout.trim();
    } catch { /* try the next shell */ }
  }
  throw new Error("无法调用 Windows DPAPI 加密 Key");
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".gz": "application/gzip", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".ico": "image/x-icon"
};

/* ---------------- 英雄素材扫描 ---------------- */
const HERO_DROP = ["透明图层", "透明", "重做", "皮肤", "拷贝", "副本", "复制", "final", "半身像"];

function normHero(filename) {
  let s = filename.replace(/\.[^.]+$/, "").replace(/\u3000/g, " ").trim();
  s = s.replace(/[（(]\s*\d+\s*[)）]/g, "");
  for (const w of HERO_DROP) s = s.replace(new RegExp(w, "gi"), "");
  s = s.replace(/\s*\d+$/, "");
  s = s.split(/[-–—_·]/)[0].trim().replace(/\s+/g, "");
  if (s.startsWith("元流之子")) s = "元流之子";
  return s;
}

function imageMeta(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(65536, fs.statSync(file).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      const colorType = buf[25];
      let alpha = colorType === 4 || colorType === 6;
      if (colorType === 3) alpha = buf.includes(Buffer.from("tRNS"));
      return { w, h, alpha, format: "png" };
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), alpha: false, format: "jpg" };
        }
        i += 2 + len;
      }
      return { w: 0, h: 0, alpha: false, format: "jpg" };
    }
  } catch { /* ignore */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return { w: 0, h: 0, alpha: false, format: "?" };
}

const NON_HERO = ["kv", "海报", "界面", "峡谷", "朋友节", "盛典", "周年", "集合", "原画", "平面", "焰火", "午后", "云上", "元灯", "星梦"];

let heroCache = null;
function scanHeroes(force) {
  if (heroCache && !force) return heroCache;
  const heroes = {}, others = [], all = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      const rel = path.relative(DIR_HERO, full).split(path.sep).join("/");
      const st = fs.statSync(full);
      const meta = imageMeta(full);
      const hero = normHero(e.name);
      const rec = {
        file: e.name, rel, hero, skin: /[-–—_·]/.test(e.name.replace(/\.[^.]+$/, "")),
        thumb: path.posix.join(...path.dirname(rel).split(path.sep), path.basename(rel).replace(/\.[^.]+$/, ".webp")),
        w: meta.w, h: meta.h, alpha: meta.alpha, format: meta.format, bytes: st.size, mtime: st.mtimeMs
      };
      const webpRel = rec.thumb.replace(/\//g, path.sep);
      rec.opt = fs.existsSync(path.join(DIR_OPT, webpRel)) ? rec.thumb : null;
      if (!fs.existsSync(path.join(DIR_THUMB, webpRel))) rec.thumb = null;
      const low = e.name.toLowerCase();
      const isAsset = ext === ".jpg" || ext === ".jpeg" || NON_HERO.some(k => low.includes(k));
      all.push(rec);
      if (isAsset) others.push(rec);
      else (heroes[hero] = heroes[hero] || []).push(rec);
    }
  };
  walk(DIR_HERO);

  let official = [];
  try {
    official = fs.readFileSync(HERO_LIST, "utf8").split(/[、\r\n]+/).map(s => s.trim()).filter(Boolean);
  } catch { /* 名单缺失时跳过校验 */ }
  const base = new Map(official.map(n => [n.replace(/[（(].*?[)）]/g, ""), n]));

  const issues = Object.keys(heroes)
    .filter(h => official.length && !base.has(h))
    .map(h => {
      let best = null, score = 0;
      for (const off of base.keys()) {
        let head = 0;
        for (let i = 0; i < Math.min(h.length, off.length); i++) { if (h[i] !== off[i]) break; head++; }
        let tail = 0;
        for (let i = 1; i <= Math.min(h.length, off.length); i++) { if (h[h.length - i] !== off[off.length - i]) break; tail++; }
        let same = 0;
        for (const c of new Set(h)) if (off.includes(c)) same++;
        let sc = Math.max(head, tail, same);
        if (h.length === off.length) {
          const ham = [...h].filter((c, i) => c !== off[i]).length;
          sc = Math.max(sc, h.length - ham + 1);
        }
        if (sc > score) { best = off; score = sc; }
      }
      return { hero: h, suggest: score >= 2 ? best : null, files: heroes[h].map(r => r.rel) };
    });

  heroCache = { heroes, others, official, issues, scannedAt: Date.now(), total: all.length };
  return heroCache;
}

/* ---------------- 工具 ---------------- */
function send(res, code, body, headers = {}) {
  res.writeHead(code, { "Cache-Control": "no-cache", ...headers });
  res.end(body);
}
function sendJSON(res, obj, code = 200) {
  send(res, code, Buffer.from(JSON.stringify(obj)), { "Content-Type": "application/json; charset=utf-8" });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function readBodyLimited(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) reject(Object.assign(new Error("上传内容超过大小限制"), { code: "payload_too_large" }));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}
function safeJoin(baseDir, rel) {
  const p = path.resolve(baseDir, decodeURIComponent(rel).replace(/^[/\\]+/, ""));
  return p.startsWith(path.resolve(baseDir)) ? p : null;
}
function serveFile(res, file, extra = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not Found: " + path.basename(file), { "Content-Type": "text/plain; charset=utf-8" });
    send(res, 200, buf, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", ...extra });
  });
}

const STORE_KEYS = new Set(["library", "matches", "prefs", "heroPick", "bracket", "context", "heroStats"]);
const BACKUP_KEYS = new Set([...STORE_KEYS, "heroStats"]);
/* 这些是真正的赛事数据：多标签页同时写时要拦住，避免互相覆盖。
   context 只是“当前选中哪一局”的现场指针，按后写覆盖即可。 */
const STORE_CONFLICT_KEYS = new Set(["library", "matches", "bracket", "heroPick", "heroStats"]);

function storeRev(key) {
  return dataStore.revisionOf(key);
}

function readStoreJson(key, fallback = null) {
  return dataStore.readData(key, fallback);
}

function combinedHeroStatsData(seriesId = "") {
  return buildHeroStatsWithMatchData({
    library: readStoreJson("library", null),
    matches: readStoreJson("matches", { games: {} }),
    manual: readHeroStats(),
    seriesId,
  });
}

async function appendDataAudit(action, detail = "", key = "", actor = "") {
  return dataStore.appendAudit(action, detail, key, actor);
}

async function readDataAudit(limit = 50) {
  return dataStore.readAudit(limit);
}

function readCookie(req, name) {
  const source = String(req.headers.cookie || "");
  for (const part of source.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ""; }
  }
  return "";
}

function lanAddresses() {
  const output = [];
  for (const [alias, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal || !entry.address) continue;
      output.push({ interface: alias, address: entry.address, url: `http://${entry.address}:${PORT}/remote` });
    }
  }
  return output;
}

function remoteAccessPayload() {
  const access = remoteAccess.accessInfo();
  return {
    enabled: REMOTE_MODE,
    host: LISTEN_HOST,
    port: PORT,
    urls: lanAddresses(),
    pin: access.pin,
    pinExpiresAt: access.pinExpiresAt,
    sessionCount: access.sessionCount,
    maxSessions: access.maxSessions,
  };
}

function remoteCookie(sessionId, maxAge = 8 * 60 * 60) {
  return `pkc_remote_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function remoteMatchSources() {
  const library = readStoreJson("library", null);
  const matches = readStoreJson("matches", { games:{} });
  const bracket = readStoreJson("bracket", {});
  const storedContext = readCompetitionContext();
  return { library, matches, bracket, context:storedContext.context, contextRevision:storedContext.revision };
}

function remoteMatchCatalog() {
  const source = remoteMatchSources();
  const catalog = buildRemoteMatchContext({
    library:source.library,
    matches:source.matches,
    bracket:source.bracket,
    context:source.context,
    matchesRevision:storeRev("matches"),
    contextRevision:source.contextRevision,
  });
  return { ...catalog, source };
}

function validateRemoteImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 4) {
    throw Object.assign(new Error("请上传 1—4 张截图"), { code:"invalid_image_count" });
  }
  let total = 0;
  return images.map((value, index) => {
    const match = String(value || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw Object.assign(new Error("第 " + (index + 1) + " 张不是受支持的图片"), { code:"invalid_image_type" });
    const bytes = Buffer.from(match[2], "base64").length;
    if (bytes > 10 * 1024 * 1024) {
      throw Object.assign(new Error("第 " + (index + 1) + " 张图片超过 10MB"), { code:"image_too_large" });
    }
    total += bytes;
    if (total > 32 * 1024 * 1024) {
      throw Object.assign(new Error("图片合计超过 32MB"), { code:"images_too_large" });
    }
    return String(value);
  });
}

async function saveRemoteMatchData(body) {
  const catalog = remoteMatchCatalog();
  const source = catalog.source;
  const series = (source.library?.series || []).find((item) => String(item.id) === catalog.seriesId);
  if (!series) throw Object.assign(new Error("找不到当前系列赛"), { code:"series_not_found" });
  if (body.seriesId && String(body.seriesId) !== String(series.id)) {
    throw Object.assign(new Error("远程录入只能写入当前系列赛"), { code:"series_scope_denied" });
  }
  if (!body.baseRev || body.baseRev !== catalog.matchesRevision) {
    throw Object.assign(new Error("对局数据已在其他页面更新，请重新读取"), {
      code:"revision_conflict",
      revision:catalog.matchesRevision,
    });
  }
  if (body.contextRevision !== undefined
    && Number(body.contextRevision) !== Number(catalog.contextRevision)) {
    throw Object.assign(new Error("当前场次已在其他页面更新，请重新读取"), {
      code:"context_conflict",
      revision:catalog.contextRevision,
    });
  }
  const match = catalog.matches.find((item) => item.matchKey === String(body.matchKey || ""));
  if (!match) throw Object.assign(new Error("找不到目标场次或双方队伍尚未排定"), { code:"match_not_found" });
  const blueTeam = (series.teams || []).find((team) => String(team.id) === match.blueId);
  const redTeam = (series.teams || []).find((team) => String(team.id) === match.redId);
  const games = Array.isArray(source.matches?.games?.[series.id]) ? source.matches.games[series.id] : [];
  const existingGame = body.gameId ? games.find((game) => String(game.id) === String(body.gameId)) : null;
  if (body.gameId && (!existingGame || String(existingGame.matchKey || "") !== match.matchKey)) {
    throw Object.assign(new Error("目标局次不属于所选场次"), { code:"game_not_found" });
  }
  const built = buildRemoteGame({
    seriesId:series.id,
    matchKey:match.matchKey,
    blueTeam,
    redTeam,
    draft:body.draft,
    existingGames:games,
    existingGame,
    allowedMatchKeys:catalog.matches.map((item) => item.matchKey),
  });
  const nextMatches = {
    ...source.matches,
    games: {
      ...(source.matches.games || {}),
      [series.id]: existingGame
        ? games.map((game) => String(game.id) === built.game.id ? built.game : game)
        : [...games, built.game],
    },
  };
  const previousMatches = source.matches;
  const matchWrite = await dataStore.writeData("matches", nextMatches, {
    baseRevision:storeRev("matches"),
    forceBackup:true,
    actor:body.actor || "remote",
  });
  if (!matchWrite.ok && matchWrite.conflict) {
    throw Object.assign(new Error("对局数据已在其他页面更新，请重新读取"), {
      code:"revision_conflict",
      revision:matchWrite.revision,
    });
  }
  try {
    const candidate = {
      ...(source.context || {}),
      seriesId:series.id,
      seriesName:series.name || "",
      matchKey:match.matchKey,
      matchLabel:match.roundLabel + " · " + match.blueName + " vs " + match.redName,
      matchRound:match.roundLabel,
      gameId:built.game.id,
      gameLabel:built.game.label,
      blueId:match.blueId,
      redId:match.redId,
      blueTeam:match.blueName,
      redTeam:match.redName,
      blueScore:built.game.ourScore,
      redScore:built.game.oppScore,
      remoteSavedAt:new Date().toISOString(),
    };
    const contextResult = await saveCompetitionContext(candidate, catalog.contextRevision, {
      actor:body.actor || "remote",
    });
    if (contextResult.conflict) {
      throw Object.assign(new Error("当前场次已在其他页面更新，请重新读取"), {
        code:"context_conflict",
        revision:contextResult.revision,
      });
    }
    setDirectorContext(contextResult.context);
    await appendDataAudit(
      "remote-upload-save",
      (existingGame ? "覆盖" : "新建") + " " + built.game.label + " · 缺失 " + built.missing.length + " 项",
      "matches",
      body.actor || "remote",
    );
    return {
      ok:true,
      replaced:built.replaced,
      game:built.game,
      missing:built.missing,
      warnings:built.warnings,
      revision:storeRev("matches"),
      contextRevision:contextResult.revision,
      context:contextResult.context,
    };
  } catch (error) {
    try {
      await dataStore.writeData("matches", previousMatches, { actor:"rollback" });
    } catch { /* original write remains backed up in Supabase */ }
    throw error;
  }
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const localRequest = isLoopbackAddress(req.socket.remoteAddress);
  let remoteSession = null;
  try {
    if (p === "/healthz") {
      return sendJSON(res, {
        ok: true,
        cloud: dataStore.hasCloudDataStore(),
        uptime: Math.round(process.uptime()),
      });
    }
    if (REMOTE_MODE && !localRequest && !remoteRequestAllowed(p)) {
      return sendJSON(res, { error: "remote_only_endpoint", message: "局域网远程模式只开放手机控制接口" }, 403);
    }
    if (p.startsWith("/api/remote/")
      && !["/api/remote/pair", "/api/remote/access", "/api/remote/refresh-pin"].includes(p)) {
      const sessionId = readCookie(req, "pkc_remote_session");
      remoteSession = remoteAccess.authenticate(sessionId);
      if (!remoteSession) return sendJSON(res, { error: "remote_auth_required" }, 401);
    }
    if (p === "/remote" || p === "/remote/") {
      return serveFile(res, REMOTE_PAGE, { "Cache-Control": "no-store" });
    }
    if (p === "/api/remote/access" && req.method === "GET") {
      if (!localRequest) return sendJSON(res, { error: "local_only" }, 403);
      return sendJSON(res, remoteAccessPayload());
    }
    if (p === "/api/remote/refresh-pin" && req.method === "POST") {
      if (!localRequest) return sendJSON(res, { error: "local_only" }, 403);
      return sendJSON(res, { ok: true, ...remoteAccessPayload() });
    }
    if (p === "/api/remote/pair" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      try {
        const paired = remoteAccess.pair({
          pin: body.pin,
          ip: req.socket.remoteAddress || "unknown",
          deviceName: body.deviceName,
        });
        res.setHeader("Set-Cookie", remoteCookie(paired.sessionId));
        await appendDataAudit("remote-pair", paired.deviceName, "remote");
        return sendJSON(res, {
          ok: true,
          csrf: paired.csrf,
          deviceName: paired.deviceName,
          expiresAt: paired.expiresAt,
        });
      } catch (error) {
        if (!(error instanceof RemoteControlError)) throw error;
        if (error.retryAfterMs) res.setHeader("Retry-After", String(Math.ceil(error.retryAfterMs / 1000)));
        return sendJSON(res, { error: error.code, message: error.message, retryAfterMs: error.retryAfterMs }, error.code === "rate_limited" ? 429 : 401);
      }
    }
    if (p === "/api/remote/state" && req.method === "GET") {
      return sendJSON(res, {
        ...remoteDirectorState(),
        remote: {
          deviceName: remoteSession.deviceName,
          expiresAt: remoteSession.expiresAt,
          csrf: remoteSession.csrf,
        },
      });
    }
    if (p === "/api/remote/stream" && req.method === "GET") {
      directorStreamApi(res);
      return;
    }
    if (p === "/api/remote/action" && req.method === "POST") {
      if (!remoteAccess.verifyCsrf(remoteSession?.id, req.headers["x-pkc-csrf"])) {
        return sendJSON(res, { error: "csrf_rejected" }, 403);
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = remoteDirectorAction(body);
      if (result.status >= 200 && result.status < 300) {
        if (["push", "undo-push", "blank"].includes(body.action)) {
          await appendDataAudit("remote-" + body.action, remoteSession.deviceName, "remote");
        }
      }
      return sendJSON(res, result.body, result.status);
    }
    if (p === "/api/remote/match-context" && req.method === "GET") {
      try {
        const { source, ...catalog } = remoteMatchCatalog();
        return sendJSON(res, catalog);
      } catch (error) {
        return sendJSON(res, { error:error.code || "match_context_failed", message:error.message }, 500);
      }
    }
    if (p === "/api/remote/ocr-draft" && req.method === "POST") {
      if (!remoteAccess.verifyCsrf(remoteSession?.id, req.headers["x-pkc-csrf"])) {
        return sendJSON(res, { error:"csrf_rejected" }, 403);
      }
      try {
        const raw = await readBodyLimited(req, 48 * 1024 * 1024);
        const body = JSON.parse(raw || "{}");
        const images = validateRemoteImages(body.images);
        const catalog = remoteMatchCatalog();
        const match = catalog.matches.find((item) => item.matchKey === String(body.matchKey || ""));
        if (!match) return sendJSON(res, { error:"match_not_found", message:"找不到目标场次" }, 404);
        const series = (catalog.source.library?.series || []).find((item) => String(item.id) === catalog.seriesId);
        const blueTeam = series.teams.find((team) => String(team.id) === match.blueId);
        const redTeam = series.teams.find((team) => String(team.id) === match.redId);
        const games = catalog.source.matches?.games?.[series.id] || [];
        const existingGame = body.gameId ? games.find((game) => String(game.id) === String(body.gameId)) : null;
        if (body.gameId && (!existingGame || String(existingGame.matchKey || "") !== match.matchKey)) {
          return sendJSON(res, { error:"game_not_found", message:"目标局次不属于所选场次" }, 404);
        }
        const hint = [
          "当前场次：" + match.roundLabel + " · " + match.blueName + " vs " + match.redName,
          "蓝方名单：" + (blueTeam.players || []).join("、"),
          "红方名单：" + (redTeam.players || []).join("、"),
          body.hint,
        ].filter(Boolean).join("\n");
        const out = await callDeepSeekOCR(images, hint);
        const draft = mergeRemoteDraft({
          ocr:out.data,
          existingGame,
          blueTeam,
          redTeam,
        });
        const knownHeroes = new Set(Object.keys(scanHeroes(false).heroes || {}));
        for (const row of draft.rows) {
          for (const [side, label] of [["our", "蓝方"], ["opp", "红方"]]) {
            const hero = String(row[side]?.hero || "").trim();
            if (hero && !knownHeroes.has(hero)) draft.warnings.push(label + "英雄「" + hero + "」未匹配素材名");
          }
        }
        draft.warnings = Array.from(new Set(draft.warnings));
        return sendJSON(res, {
          ok:true,
          target:{
            matchKey:match.matchKey,
            gameId:existingGame?.id || "",
            gameLabel:existingGame?.label || match.nextGameLabel,
          },
          draft,
          usage:out.usage || null,
          imageCount:images.length,
        });
      } catch (error) {
        if (error.code === "payload_too_large") {
          return sendJSON(res, { error:error.code, message:error.message }, 413);
        }
        if (["invalid_image_count", "invalid_image_type", "image_too_large", "images_too_large"].includes(error.code)) {
          return sendJSON(res, { error:error.code, message:error.message }, 400);
        }
        const keyMissing = /未配置 DeepSeek API Key/.test(String(error.message || ""));
        return sendJSON(res, {
          error:keyMissing ? "ocr_not_configured" : "ocr_failed",
          message:String(error.message || error),
        }, keyMissing ? 503 : 502);
      }
    }
    if (p === "/api/remote/match-data" && req.method === "POST") {
      if (!remoteAccess.verifyCsrf(remoteSession?.id, req.headers["x-pkc-csrf"])) {
        return sendJSON(res, { error:"csrf_rejected" }, 403);
      }
      try {
        const body = JSON.parse((await readBodyLimited(req, 2 * 1024 * 1024)) || "{}");
        return sendJSON(res, await saveRemoteMatchData(body));
      } catch (error) {
        const status = error.code === "revision_conflict" || error.code === "context_conflict" ? 409
          : ["series_not_found", "match_not_found", "game_not_found"].includes(error.code) ? 404
            : ["series_scope_denied", "invalid_match_teams", "invalid_draft"].includes(error.code) ? 400 : 500;
        return sendJSON(res, {
          error:error.code || "remote_save_failed",
          message:error.message || String(error),
          revision:error.revision,
        }, status);
      }
    }
    if (p === "/api/remote/logout" && req.method === "POST") {
      if (!remoteAccess.verifyCsrf(remoteSession?.id, req.headers["x-pkc-csrf"])) {
        return sendJSON(res, { error: "csrf_rejected" }, 403);
      }
      remoteAccess.revoke(remoteSession.id);
      res.setHeader("Set-Cookie", remoteCookie("", 0));
      return sendJSON(res, { ok: true });
    }
    if (p === "/" || p === "/index.html") {
      return serveFile(res, APP_PAGE, { "Cache-Control": "no-store" });
    }
    if (p === "/api/ping") return sendJSON(res, { ok: true, port: PORT, root: ROOT });
    if (p === "/api/ai-status") {
      const cfg = getAIConfig();
      return sendJSON(res, {
        ok: true,
        configured: !!cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
      });
    }
    if (p === "/api/ai-key" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey || apiKey.length < 8) return sendJSON(res, { ok:false, error:"API Key 格式不正确" }, 400);
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf8")); } catch { /* new config */ }
      cfg.baseUrl = String(body.baseUrl || cfg.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
      cfg.model = String(body.model || cfg.model || "deepseek-flash");
      cfg.maxTokens = Number(body.maxTokens || cfg.maxTokens || 8000);
      cfg.apiKeyEnc = protectAISecret(apiKey);
      delete cfg.apiKey;
      writeJsonAtomic(AI_CONFIG_FILE, JSON.stringify(cfg, null, 2), { backup: false });
      return sendJSON(res, { ok:true, configured:true, model:cfg.model, baseUrl:cfg.baseUrl });
    }
    if (p === "/api/ai-ocr" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const images = Array.isArray(body.images) ? body.images : [];
      if (!images.length || images.length > 4) return sendJSON(res, { error: "images 需要 1-4 张" }, 400);
      try {
        const out = await callDeepSeekOCR(images, body.hint);
        return sendJSON(res, { ok: true, ...out });
      } catch (e) {
        return sendJSON(res, { ok: false, error: String(e && e.message || e) }, 502);
      }
    }
    if (p === "/api/store/backups" && req.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!BACKUP_KEYS.has(key)) return sendJSON(res, { error: "invalid_backup_key" }, 400);
      const versions = await dataStore.listBackups(key);
      return sendJSON(res, { ok: true, key, versions });
    }
    if (p === "/api/store/restore" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const key = String(body.key || "");
      if (!BACKUP_KEYS.has(key)) return sendJSON(res, { error: "invalid_backup_key" }, 400);
      const current = storeRev(key);
      if (body.baseRev && body.baseRev !== current) {
        return sendJSON(res, { error: "conflict", key, rev: current }, 409);
      }
      try {
        const restored = await dataStore.restoreBackup(key, body.name);
        const rev = storeRev(key);
        await appendDataAudit("restore-version", "恢复版本 " + restored.name, key);
        return sendJSON(res, { ok: true, key, rev, restored });
      } catch (error) {
        return sendJSON(res, { error: "restore_failed", message: error.message }, 400);
      }
    }
    if (p === "/api/store/audit" && req.method === "GET") {
      return sendJSON(res, { ok: true, entries: await readDataAudit(url.searchParams.get("limit")) });
    }
    if (p === "/api/store/audit" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const entry = await appendDataAudit(body.action, body.detail, body.key);
      return sendJSON(res, { ok: true, entry });
    }
    if (p === "/api/store/snapshot" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
      const snapshots = [];
      for (const key of keys) {
        if (!BACKUP_KEYS.has(key)) continue;
        try {
          const snapshot = await dataStore.snapshot(key);
          if (snapshot) snapshots.push(snapshot);
        } catch { /* current file may be absent or malformed; keep other snapshots */ }
      }
      const audit = await appendDataAudit(body.action || "snapshot", body.detail || "创建操作前快照", keys.join(","));
      return sendJSON(res, { ok: true, snapshots, audit });
    }
    /* ---------------- 英雄胜率 / 手动录入 ---------------- */
    if (p === "/herostats") {
      return serveFile(res, path.join(ROOT, "director", "herostats.html"), { "Cache-Control": "no-store" });
    }
    if (p === "/season") {
      return serveFile(res, path.join(ROOT, "director", "season.html"), { "Cache-Control": "no-store" });
    }
    if (p === "/promo") {
      return serveFile(res, path.join(ROOT, "director", "promo.html"), { "Cache-Control": "no-store" });
    }
    if (p === "/api/hero-stats" && req.method === "GET") {
      const data = combinedHeroStatsData(url.searchParams.get("seriesId") || "");
      const q = url.searchParams;
      const stage = q.get("stage") || "淘汰赛";
      return sendJSON(res, {
        ok: true,
        ...aggregateHeroStats(data, {
          stage,
          group: q.get("group") || "all",
          team: q.get("team") || "all",
          player: q.get("player") || "all",
          minPicks: Number(q.get("minPicks") || 0),
        }),
      });
    }
    if (p === "/api/hero-stats/raw" && req.method === "GET") {
      const data = combinedHeroStatsData(url.searchParams.get("seriesId") || "");
      return sendJSON(res, { ok: true, ...data });
    }
    if (p === "/api/hero-stats/matches" && req.method === "GET") {
      const library = readStoreJson("library", null);
      const seriesId = url.searchParams.get("seriesId")
        || String(library && library.currentId || "");
      return sendJSON(res, {
        ok: true,
        ...listMatchGamesForHeroStats({
          library,
          matches: readStoreJson("matches", { games: {} }),
          manual: readHeroStats(),
          seriesId,
        }),
      });
    }
    if (p === "/api/hero-stats/schedule" && req.method === "GET") {
      const library = readStoreJson("library", null);
      const seriesId = url.searchParams.get("seriesId") || String(library && library.currentId || "");
      return sendJSON(res, {
        ok: true,
        ...buildGroupSchedule({
          library,
          seriesId,
        }),
      });
    }
    if (p === "/api/season/insights" && req.method === "GET") {
      const library = readStoreJson("library", null);
      const context = readStoreJson("context", null);
      const seriesId = url.searchParams.get("seriesId")
        || context?.seriesId
        || library?.currentId
        || "";
      const exists = (library?.series || []).some((series) => String(series.id) === String(seriesId));
      if (!exists) return sendJSON(res, { error: "series_not_found", seriesId }, 404);
      return sendJSON(res, buildSeasonInsights({
        library,
        matches: readStoreJson("matches", { games: {} }),
        bracket: readStoreJson("bracket", {}),
        heroStats: readHeroStats(),
        seriesId,
        context,
        stage: url.searchParams.get("stage") || "all",
        leftId: url.searchParams.get("leftId") || "",
        rightId: url.searchParams.get("rightId") || "",
      }));
    }
    if (p === "/api/hero-stats/manual" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      try {
        const out = addManualGame(readHeroStats(), body);
        await writeHeroStats(out.data);
        return sendJSON(res, {
          ok: true, seriesId: out.seriesId, gameNo: out.gameNo,
          replaced: out.replaced, mergedInto: out.mergedInto,
        });
      } catch (e) {
        return sendJSON(res, { ok: false, error: String(e && e.message || e) }, 400);
      }
    }
    if (p === "/api/hero-stats/bans" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      try {
        const library = readStoreJson("library", null);
        const matches = readStoreJson("matches", { games: {} });
        const manual = readHeroStats();
        const catalog = listMatchGamesForHeroStats({
          library,
          matches,
          manual,
          seriesId:body.seriesId || "",
        });
        const game = catalog.games.find((item) =>
          item.seriesId === String(body.seriesId || "") && item.gameId === String(body.gameId || ""));
        if (!game) return sendJSON(res, { ok:false, error:"找不到要填写禁用数据的对局" }, 404);
        if (!game.countable) return sendJSON(res, { ok:false, error:"这局选择或胜方不完整，暂不能填写禁用" }, 400);
        const next = applyMatchBans(manual, body, game);
        await writeHeroStats(next);
        await appendDataAudit("hero-stats-bans", `${game.leftTeam} vs ${game.rightTeam} · ${game.label}`, "heroStats");
        return sendJSON(res, { ok:true, bans:next.banGames[`${game.seriesId}::${game.gameId}`] || null });
      } catch (error) {
        return sendJSON(res, { ok:false, error:String(error && error.message || error) }, 400);
      }
    }
    if (p === "/api/hero-stats/reset" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (String(body.confirm || "") !== "清除") {
        return sendJSON(res, { ok: false, error: "需要确认：confirm 必须是「清除」" }, 400);
      }
      const data = readHeroStats();
      if (body.scope === "bans") {
        data.banGames = {};
        data.updatedAt = new Date().toISOString();
        await writeHeroStats(data);
        return sendJSON(res, { ok: true, clearedBans: true });
      }
      await writeHeroStats(null);
      return sendJSON(res, { ok: true, cleared: true });
    }
    if (p === "/api/hero-stats/export.csv" && req.method === "GET") {
      const data = combinedHeroStatsData(url.searchParams.get("seriesId") || "");
      const q = url.searchParams;
      const agg = aggregateHeroStats(data, {
        stage: q.get("stage") || "淘汰赛",
        group: q.get("group") || "all",
        team: q.get("team") || "all",
        player: q.get("player") || "all",
        minPicks: Number(q.get("minPicks") || 0),
      });
      const csv = toCSV(agg);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hero-stats.csv"',
        "Cache-Control": "no-store",
      });
      return res.end(csv);
    }
    // 导播台 / OBS 场景页 / 状态 API（实现见 director/routes.mjs）
    if (await handleDirector(req, res, url, { sendJSON, send, readBody, serveFile, ROOT })) return;

    if (p === "/api/heroes") {
      // 素材随时可能被整批替换：每次请求都重新扫描（129 张小图，开销可忽略），
      // 这样换完素材刷新页面就生效，不必重启服务。
      return sendJSON(res, scanHeroes(true));
    }
    if (p.startsWith("/api/store/")) {
      const key = p.slice("/api/store/".length);
      if (!STORE_KEYS.has(key)) return sendJSON(res, { error: "unknown key" }, 400);
      if (req.method === "GET") {
        res.setHeader("X-PKC-Rev", storeRev(key));
        return sendJSON(res, readStoreJson(key, null));
      }
      if (req.method === "POST") {
        let raw = await readBody(req);
        const incoming = JSON.parse(raw);                  // 校验 JSON
        if (key === "library" && incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
          try {
            const current = readStoreJson(key, null);
            if (Array.isArray(current.migrationAudit)) {
              incoming.migrationAudit = current.migrationAudit;
              raw = JSON.stringify(incoming, null, 2);
            }
          } catch { /* 首次写入或旧文件损坏时按请求体处理 */ }
        }
        const base = String(req.headers["x-pkc-base-rev"] || "");
        const cur = storeRev(key);
        if (STORE_CONFLICT_KEYS.has(key) && base && cur && base !== cur) {
          res.setHeader("X-PKC-Rev", cur);
          return sendJSON(res, { error: "conflict", key, rev: cur }, 409);
        }
        const written = await dataStore.writeData(key, incoming, {
          baseRevision: STORE_CONFLICT_KEYS.has(key) && base ? base : undefined,
          forceBackup: req.headers["x-pkc-force-backup"] === "1",
        });
        if (!written.ok && written.conflict) {
          res.setHeader("X-PKC-Rev", written.revision);
          return sendJSON(res, { error: "conflict", key, rev: written.revision }, 409);
        }
        res.setHeader("X-PKC-Rev", written.revision);
        return sendJSON(res, { ok: true, key, bytes: raw.length });
      }
    }
    // 英雄素材随时可能被整批替换：一律不许浏览器缓存，换图后刷新即可生效
    const NO_STORE = { "Cache-Control": "no-store, must-revalidate" };
    if (p.startsWith("/hero/")) return serveFile(res, safeJoin(DIR_HERO, p.slice(6)) || "", NO_STORE);
    if (p.startsWith("/thumb/")) return serveFile(res, safeJoin(DIR_THUMB, p.slice(7)) || "", NO_STORE);
    if (p.startsWith("/opt/")) return serveFile(res, safeJoin(DIR_OPT, p.slice(5)) || "", NO_STORE);
    if (p.startsWith("/hicon/")) return serveFile(res, safeJoin(DIR_HICON, p.slice(7)) || "", { "Cache-Control": "max-age=86400" });
    if (p.startsWith("/assets/")) return serveFile(res, safeJoin(DIR_ASSETS, p.slice(8)) || "", NO_STORE);
    if (p.startsWith("/docs/")) return serveFile(res, safeJoin(DIR_DOCS, p.slice(6)) || "", NO_STORE);
    if (p.startsWith("/preview/")) return serveFile(res, safeJoin(DIR_PREVIEW, p.slice(9)) || "", NO_STORE);

    // 其余按根目录静态文件处理（兼容旧链接）
    const file = safeJoin(ROOT, p);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);

    send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (e) {
    sendJSON(res, { error: String(e && e.message || e) }, 500);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("──────────────────────────────────────────────");
    console.error("  启动失败：端口 " + PORT + " 已被占用");
    console.error("  可能服务已经在运行，或另一个程序占用了这个端口。");
    console.error("  先打开 http://localhost:" + PORT + " 看看；");
    console.error("  如果打不开，关闭旧的命令行窗口后再试。");
    console.error("──────────────────────────────────────────────");
  } else {
    console.error("启动失败：" + (err && err.message ? err.message : err));
  }
  process.exit(1);
});

await dataStore.initialize();
refreshDirectorDataFromStore();

server.listen(PORT, LISTEN_HOST, () => {
  const st = scanHeroes(true);
  const heroes = Object.keys(st.heroes).length;
  console.log("──────────────────────────────────────────────");
  console.log("  PKC 赛后数据图生成器 · 本地服务已启动");
  console.log("  地址: http://localhost:" + PORT);
  if (REMOTE_MODE) {
    console.log("  远程模式: " + LISTEN_HOST + ":" + PORT);
    for (const item of lanAddresses()) console.log("  手机地址: " + item.url + "  (" + item.interface + ")");
    console.log("  临时口令: " + remoteAccess.accessInfo().pin);
  } else {
    console.log("  局域网远程控制未开启；请重新运行「启动.bat」并选择手机远程模式");
  }
  console.log("  英雄素材: " + (fs.existsSync(DIR_HERO) ? heroes + " 个英雄 / " + st.total + " 个文件" : "未找到 英雄半身像 目录"));
  console.log("  数据存储: " + (dataStore.hasCloudDataStore() ? "Supabase" : DIR_DATA));
  console.log("  关闭本窗口即停止服务");
  console.log("──────────────────────────────────────────────");

  // 双击启动脚本时设置 PKC_OPEN=1；等端口真正开始监听后再开浏览器，
  // 避免浏览器比服务先打开、出现“无法连接”的假故障。
  if (process.env.PKC_OPEN === "1") {
    const url = "http://localhost:" + PORT;
    try {
      const child = process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" });
      child.unref();
    } catch { /* 浏览器没打开时，手动访问控制台里的地址即可 */ }
  }
});
