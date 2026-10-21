/**
 * 赛宝抓取会话：启动 PowerShell、读进度、暂停/停止、把结果并入 heroStats.json。
 *
 * 抓取脚本只做“导航 + 截图 + 元数据”，图像切图和聚类由 Python 完成；
 * 这样 PowerShell 不需要处理像素，Python 也不需要碰 UIA。
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./json-store.mjs";
import {
  normalizeHeroStats, mergeSeries, recountClusters,
} from "./hero-stats.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = path.join(ROOT, "tmp");
const DATA_DIR = path.join(ROOT, "数据");
const STORE = path.join(DATA_DIR, "heroStats.json");
const PS1 = path.join(ROOT, "tools", "saibao-capture.ps1");

let current = null;

export function heroStatsFile() {
  return STORE;
}

export function readHeroStats() {
  try {
    return normalizeHeroStats(JSON.parse(fs.readFileSync(STORE, "utf8").replace(/^\uFEFF/, "")));
  } catch {
    return normalizeHeroStats(null);
  }
}

export function writeHeroStats(data) {
  const next = normalizeHeroStats(data);
  writeJsonAtomic(STORE, JSON.stringify(next, null, 2), {
    backupDir: path.join(DATA_DIR, "_backup"),
    key: "heroStats",
  });
  return next;
}

export function listSessions() {
  try {
    return fs.readdirSync(TMP, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("赛宝抓取-"))
      .map((e) => {
        const dir = path.join(TMP, e.name);
        let mtime = 0;
        try { mtime = fs.statSync(dir).mtimeMs; } catch { /* ignore */ }
        return { name: e.name, dir, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function latestSession() {
  return listSessions()[0] || null;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function readJson(file, fallback = null) {
  try {
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function appendLog(dir, text) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "capture.log"), String(text), "utf8");
  } catch { /* ignore */ }
}

function processCaptureIcons(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || "python", [path.join(ROOT, "tools", "saibao_icons.py"), dir], {
      cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 20 * 60 * 1000);
    timer.unref?.();
    child.stdout.on("data", (b) => appendLog(dir, "\n[icons] " + b.toString()));
    child.stderr.on("data", (b) => appendLog(dir, "\n[icons:err] " + b.toString()));
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("头像整理超时（20 分钟）"));
      if (code !== 0) return reject(new Error(`头像整理退出码 ${code == null ? "未知" : code}${signal ? `（${signal}）` : ""}`));
      resolve();
    });
  });
}

export function startCapture({ groups = "1,2,3,4", maxSeries = 0, quiet = false } = {}) {
  if (current && (current.processing || (current.child && current.child.exitCode === null))) {
    return { ok: false, error: "已有抓取在运行" };
  }
  if (!fs.existsSync(PS1)) return { ok: false, error: "缺少 tools/saibao-capture.ps1" };
  fs.mkdirSync(TMP, { recursive: true });
  const dir = path.join(TMP, "赛宝抓取-" + stamp());
  fs.mkdirSync(dir, { recursive: true });
  const args = { groups: String(groups || "1,2,3,4"), maxSeries: Number(maxSeries) || 0, quiet: !!quiet, startedAt: new Date().toISOString() };
  writeJsonAtomic(path.join(dir, "args.json"), JSON.stringify(args, null, 2), { backup: false });
  writeJsonAtomic(path.join(dir, "status.json"), JSON.stringify({ phase: "capturing", processing: false }, null, 2), { backup: false });

  const psArgs = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1,
    "-SessionDir", dir, "-Groups", args.groups, "-MaxSeries", String(args.maxSeries),
  ];
  if (args.quiet) psArgs.push("-Quiet");
  const child = spawn("powershell.exe", psArgs, {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const session = { dir, child, startedAt: Date.now(), error: "", phase: "capturing", processing: false };
  current = session;
  child.stdout.on("data", (b) => appendLog(dir, b.toString()));
  child.stderr.on("data", (b) => appendLog(dir, b.toString()));
  child.on("error", (e) => {
    session.error = String(e && e.message || e);
    appendLog(dir, "\n[spawn error] " + session.error + "\n");
  });
  child.on("close", async (code, sig) => {
    session.exitCode = code;
    appendLog(dir, `\n[exit] code=${code} signal=${sig || ""}\n`);
    session.processing = true;
    session.phase = "processing";
    writeJsonAtomic(path.join(dir, "status.json"), JSON.stringify({ phase: session.phase, processing: true, exitCode: code }, null, 2), { backup: false });
    const errors = [];
    if (code !== 0 && !fs.existsSync(path.join(dir, "stop.flag"))) {
      errors.push(`抓取脚本退出码 ${code == null ? "未知" : code}`);
    }
    try {
      await processCaptureIcons(dir);
    } catch (e) {
      errors.push("头像整理失败：" + String(e && e.message || e));
    }
    try {
      const out = ingestSession(dir);
      if (!out.ok) errors.push("数据合并失败：" + String(out.error || "未知错误"));
      else if (out.mergeErrors) errors.push(...out.mergeErrors.map((x) => "数据合并失败：" + x));
      session.ingestResult = out;
    } catch (e) {
      errors.push("数据合并失败：" + String(e && e.message || e));
    }
    const stopped = fs.existsSync(path.join(dir, "stop.flag"));
    session.error = errors.join("；");
    session.phase = errors.length ? "failed" : stopped ? "stopped" : "done";
    session.processing = false;
    if (session.error) appendLog(dir, "\n[postprocess error] " + session.error + "\n");
    appendLog(dir, "\n[session " + session.phase + "]\n");
    writeJsonAtomic(path.join(dir, "status.json"), JSON.stringify({
      phase: session.phase, processing: false, exitCode: code,
      error: session.error, ingestResult: session.ingestResult || null,
    }, null, 2), { backup: false });
  });
  return { ok: true, session: path.basename(dir), dir };
}

export function pauseCapture() {
  const dir = current && current.dir;
  if (!dir) return { ok: false, error: "没有正在运行的抓取" };
  fs.writeFileSync(path.join(dir, "pause.flag"), "1", "utf8");
  return { ok: true, paused: true };
}

export function resumeCapture() {
  const dir = current && current.dir;
  if (!dir) return { ok: false, error: "没有正在运行的抓取" };
  try { fs.unlinkSync(path.join(dir, "pause.flag")); } catch { /* already gone */ }
  return { ok: true, paused: false };
}

export function stopCapture() {
  const dir = current && current.dir;
  if (!dir) return { ok: false, error: "没有正在运行的抓取" };
  fs.writeFileSync(path.join(dir, "stop.flag"), "1", "utf8");
  try {
    if (current.child && current.child.exitCode === null) {
      const pid = current.child.pid;
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    }
  } catch { /* 任务可能已经结束 */ }
  return { ok: true, stopped: true };
}

export function captureStatus() {
  const session = current || latestSession();
  if (!session) {
    return {
      ok: true, running: false, paused: false, phase: "idle",
      progress: null, session: "", message: "还没有抓取记录",
    };
  }
  const dir = session.dir;
  const progress = readJson(path.join(dir, "progress.json"), null);
  const args = readJson(path.join(dir, "args.json"), {});
  const savedStatus = readJson(path.join(dir, "status.json"), {});
  const result = readJson(path.join(dir, "result.json"), null);
  const isCurrent = !!(current && current.dir === dir);
  const running = !!(current && current.child && current.child.exitCode === null);
  const processing = !!(isCurrent && session.processing);
  const interrupted = !isCurrent && (savedStatus.processing || savedStatus.phase === "capturing");
  const paused = fs.existsSync(path.join(dir, "pause.flag"));
  const stopped = fs.existsSync(path.join(dir, "stop.flag"));
  const logTail = tail(path.join(dir, "capture.log"), 4000);
  return {
    ok: true,
    running,
    processing,
    paused,
    stopped,
    phase: interrupted ? "failed" : session.phase || savedStatus.phase || (progress && progress.phase) || (running ? "capturing" : (result ? "done" : "idle")),
    session: path.basename(dir),
    dir,
    startedAt: args.startedAt || "",
    quiet: !!args.quiet,
    progress,
    hasResult: !!result,
    resultSummary: result ? {
      series: Array.isArray(result.series) ? result.series.length : 0,
      clusters: result.clusters ? Object.keys(result.clusters).length : 0,
      errors: Array.isArray(result.errors) ? result.errors.length : 0,
    } : null,
    error: session.error || savedStatus.error || (interrupted ? "服务在后处理完成前停止，数据状态需要检查" : ""),
    ingestResult: session.ingestResult || savedStatus.ingestResult || null,
    logTail,
  };
}

function tail(file, max) {
  try {
    const s = fs.readFileSync(file, "utf8");
    return s.length > max ? s.slice(-max) : s;
  } catch {
    return "";
  }
}

/**
 * 把一个抓取会话的结果并入 heroStats.json。
 * 幂等：同一 series id 会覆盖，不会重复累计簇计数。
 */
export function ingestSession(dir) {
  const result = readJson(path.join(dir, "result.json"), null);
  if (!result) return { ok: false, error: "没有 result.json" };
  let data = readHeroStats();
  const mergeErrors = [];
  data.event = String(result.event || data.event || "2026PKC秋季赛");
  data.stage = String(result.stage || data.stage || "循环赛");
  if (!data.capturedAt) data.capturedAt = new Date().toISOString();
  for (const s of result.series || []) {
    if (s && (/16进8 BO5|全部赛程|双败淘汰赛/.test(String(s.id || ""))
      || (Array.isArray(s.teams) && s.teams.some((t) => /16进8 BO5|全部赛程|双败淘汰赛/.test(String(t)))))) {
      appendLog(dir, "\n[skip bogus series] " + String(s.id || "") + "\n");
      continue;
    }
    try { data = mergeSeries(data, s); } catch (e) {
      const message = String(e && e.message || e);
      mergeErrors.push(message);
      appendLog(dir, "\n[merge error] " + message + "\n");
    }
  }
  if (result.clusters && typeof result.clusters === "object") {
    // 只补 sample/count；已有英雄名不覆盖
    const sessionName = path.basename(dir);
    for (const [hash, v] of Object.entries(result.clusters)) {
      if (!hash || !v) continue;
      const prev = data.clusters[hash] || {};
      const rawSample = String(v.sample || "");
      const sample = rawSample
        ? (rawSample.startsWith("/") || /^https?:/.test(rawSample)
          ? rawSample
          : `/capture/${encodeURIComponent(sessionName)}/${rawSample.replace(/^\/+/, "")}`)
        : String(prev.sample || "");
      data.clusters[hash] = {
        ...prev,
        sample,
        firstSeen: String(prev.firstSeen || v.firstSeen || new Date().toISOString()),
        kind: String(v.kind || prev.kind || "pick"),
      };
    }
  }
  data = writeHeroStats(recountClusters(data));
  return {
    ok: mergeErrors.length === 0,
    ...(mergeErrors.length ? { error: `${mergeErrors.length} 个系列赛未能合并` } : {}),
    mergeErrors,
    series: data.series.length,
    clusters: Object.keys(data.clusters).length,
  };
}

/** 给页面用：最近的簇样本图走 /capture/<session>/<file>。 */
export function clusterSampleUrl(sessionName, hash) {
  return `/capture/${encodeURIComponent(sessionName)}/icons/${encodeURIComponent(hash)}.png`;
}
