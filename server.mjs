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
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleDirector, closeDirectorStreams } from "./director/routes.mjs";
import { writeJsonAtomic } from "./lib/json-store.mjs";
import { aggregateHeroStats, applyLabels, toCSV, addManualGame } from "./lib/hero-stats.mjs";
import {
  readHeroStats, writeHeroStats, startCapture, captureStatus,
  pauseCapture, resumeCapture, stopCapture, ingestSession, listSessions,
} from "./lib/saibao-capture.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PKC_PORT || 8971);
const DIR_HERO = path.join(ROOT, "英雄半身像");
const DIR_THUMB = path.join(ROOT, "英雄缩略图");
const DIR_OPT = path.join(ROOT, "英雄优化");
const DIR_HICON = path.join(ROOT, "素材", "_官方头像");
const DIR_DATA = path.join(ROOT, "数据");
const DIR_ASSETS = path.join(ROOT, "assets");
const DIR_DOCS = path.join(ROOT, "docs");
const DIR_PREVIEW = path.join(ROOT, "预览");
const APP_PAGE = path.join(ROOT, "director", "console.html");
const HERO_LIST = path.join(ROOT, "tools", "_herolist.txt");
const AI_CONFIG_FILE = path.join(DIR_DATA, "ai-config.json");
const AI_SECRET_HELPER = path.join(ROOT, "tools", "ai-secret.ps1");

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
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status + ": " + raw.slice(0, 500));
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("DeepSeek 返回格式异常"); }
  let text = payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content : "";
  text = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!text) throw new Error("DeepSeek 没有返回最终 JSON（可能是推理 token 用尽）");
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

const STORE_KEYS = new Set(["library", "matches", "prefs", "heroPick", "bracket", "context"]);
/* 这些是真正的赛事数据：多标签页同时写时要拦住，避免互相覆盖。
   context 只是“当前选中哪一局”的现场指针，按后写覆盖即可。 */
const STORE_CONFLICT_KEYS = new Set(["library", "matches", "bracket", "heroPick"]);

/** 用文件内容哈希当版本号：服务重启后依然有效，不需要额外状态。 */
function storeRev(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
  } catch {
    return "";
  }
}
const storeFile = key => path.join(DIR_DATA, key + ".json");

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
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
    /* ---------------- 英雄胜率 / 赛宝抓取 ---------------- */
    if (p === "/herostats") {
      return serveFile(res, path.join(ROOT, "director", "herostats.html"), { "Cache-Control": "no-store" });
    }
    if (p === "/promo") {
      return serveFile(res, path.join(ROOT, "director", "promo.html"), { "Cache-Control": "no-store" });
    }
    if (p === "/api/hero-stats" && req.method === "GET") {
      const data = readHeroStats();
      const q = url.searchParams;
      const stage = q.get("stage") || data.stage || "循环赛";
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
      const data = readHeroStats();
      return sendJSON(res, {
        ok: true,
        ...data,
        sessions: listSessions().map((s) => ({ name: s.name, mtime: s.mtime })),
      });
    }
    if (p === "/api/hero-stats/labels" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const labels = body && body.labels && typeof body.labels === "object" ? body.labels : {};
      const data = applyLabels(readHeroStats(), labels);
      writeHeroStats(data);
      return sendJSON(res, { ok: true, clusters: data.clusters });
    }
    if (p === "/api/hero-stats/manual" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      try {
        const out = addManualGame(readHeroStats(), body);
        writeHeroStats(out.data);
        return sendJSON(res, {
          ok: true, seriesId: out.seriesId, gameNo: out.gameNo,
          replaced: out.replaced, mergedInto: out.mergedInto,
        });
      } catch (e) {
        return sendJSON(res, { ok: false, error: String(e && e.message || e) }, 400);
      }
    }
    if (p === "/api/hero-stats/reset" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (String(body.confirm || "") !== "清除") {
        return sendJSON(res, { ok: false, error: "需要确认：confirm 必须是「清除」" }, 400);
      }
      writeHeroStats(null);
      return sendJSON(res, { ok: true, cleared: true });
    }
    if (p === "/api/hero-stats/ingest" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const sessions = listSessions();
      const dir = body.session
        ? (sessions.find((s) => s.name === body.session) || {}).dir
        : (sessions[0] || {}).dir;
      if (!dir) return sendJSON(res, { ok: false, error: "没有可用的抓取会话" }, 400);
      const out = ingestSession(dir);
      return sendJSON(res, out, out.ok ? 200 : 400);
    }
    if (p === "/api/hero-stats/export.csv" && req.method === "GET") {
      const data = readHeroStats();
      const q = url.searchParams;
      const agg = aggregateHeroStats(data, {
        stage: q.get("stage") || data.stage || "循环赛",
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
    if (p === "/api/saibao/capture/start" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      return sendJSON(res, startCapture({ groups: body.groups, maxSeries: body.maxSeries, quiet: !!body.quiet }));
    }
    if (p === "/api/saibao/capture/status" && req.method === "GET") {
      return sendJSON(res, captureStatus());
    }
    if (p === "/api/saibao/capture/pause" && req.method === "POST") {
      return sendJSON(res, pauseCapture());
    }
    if (p === "/api/saibao/capture/resume" && req.method === "POST") {
      return sendJSON(res, resumeCapture());
    }
    if (p === "/api/saibao/capture/stop" && req.method === "POST") {
      return sendJSON(res, stopCapture());
    }
    if (p.startsWith("/capture/")) {
      const rest = p.slice("/capture/".length).split("/");
      const session = decodeURIComponent(rest.shift() || "");
      const rel = rest.map(decodeURIComponent).join("/");
      if (!session || !rel) return send(res, 404, "Not Found");
      const base = path.join(ROOT, "tmp", session);
      const file = safeJoin(base, rel);
      if (!file) return send(res, 403, "Forbidden");
      return serveFile(res, file, { "Cache-Control": "no-store" });
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
      const file = storeFile(key);
      if (req.method === "GET") {
        try {
          const raw = fs.readFileSync(file, "utf8");
          res.setHeader("X-PKC-Rev", storeRev(file));
          return sendJSON(res, JSON.parse(raw));
        } catch {
          return sendJSON(res, null);
        }
      }
      if (req.method === "POST") {
        let raw = await readBody(req);
        const incoming = JSON.parse(raw);                  // 校验 JSON
        if (key === "library" && incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
          try {
            const current = JSON.parse(fs.readFileSync(file, "utf8"));
            if (Array.isArray(current.migrationAudit)) {
              incoming.migrationAudit = current.migrationAudit;
              raw = JSON.stringify(incoming, null, 2);
            }
          } catch { /* 首次写入或旧文件损坏时按请求体处理 */ }
        }
        const base = String(req.headers["x-pkc-base-rev"] || "");
        const cur = storeRev(file);
        if (STORE_CONFLICT_KEYS.has(key) && base && cur && base !== cur) {
          res.setHeader("X-PKC-Rev", cur);
          return sendJSON(res, { error: "conflict", key, rev: cur }, 409);
        }
        writeJsonAtomic(file, raw, {
          backupDir: path.join(DIR_DATA, "_backup"),
          key,
        });
        res.setHeader("X-PKC-Rev", storeRev(file));
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

server.listen(PORT, "127.0.0.1", () => {
  const st = scanHeroes(true);
  const heroes = Object.keys(st.heroes).length;
  console.log("──────────────────────────────────────────────");
  console.log("  PKC 赛后数据图生成器 · 本地服务已启动");
  console.log("  地址: http://localhost:" + PORT);
  console.log("  英雄素材: " + (fs.existsSync(DIR_HERO) ? heroes + " 个英雄 / " + st.total + " 个文件" : "未找到 英雄半身像 目录"));
  console.log("  数据目录: " + DIR_DATA);
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
