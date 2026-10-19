/**
 * 两张客户端截图一起跑识别，且拦截保存请求，避免回归测试改到真实比赛数据。
 * 用法： node tools/verify-ocr-batch.mjs "<装备页>" "<数据页>"
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const OUT = path.join(ROOT, "tmp", "ocr-e2e-20261018");
fs.mkdirSync(OUT, { recursive: true });
const files = process.argv.slice(2).filter(Boolean);
if (files.length < 1) {
  console.error("用法: node tools/verify-ocr-batch.mjs <图片1> [图片2]");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const problems = [];
page.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
page.on("pageerror", e => problems.push("pageerror: " + e.message));
await page.route("**/api/store/**", route => {
  if (route.request().method() === "POST") return route.abort();
  return route.continue();
});

const GENERATOR = "http://localhost:8971/generator";
await page.goto(GENERATOR, { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });
const t0 = Date.now();
await page.setInputFiles("#fileShot", files);

let state = "timeout";
try {
  await page.waitForFunction(
    () => /识别完成|识别失败|不可用/.test(document.querySelector("#ocrMsg").textContent),
    null, { timeout: 600000 });
  state = await page.$eval("#ocrMsg", el => el.textContent);
} catch { state = "等待超时"; }
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

const result = await page.evaluate(() => {
  const g = window.PKC.game();
  const d = window.PKC.ocrDebug();
  return {
    duration: g.duration,
    scores: [g.ourScore, g.oppScore],
    rows: g.rows.map(r => ({
      pos: r.pos,
      our: { name:r.our.name, hero:r.our.hero, kda:[r.our.k,r.our.d,r.our.a].join("/"),
             gold:r.our.gold, dmgWan:r.our.dmgWan, dmgPct:r.our.dmgPct,
             dmgRaw:r.our.dmgRaw, tankRaw:r.our.tankRaw, goldRaw:r.our.goldRaw,
             tankPct:r.our.tankPct, goldShare:r.our.goldShare, kp:r.our.kp },
      opp: { name:r.opp.name, hero:r.opp.hero, kda:[r.opp.k,r.opp.d,r.opp.a].join("/"),
             gold:r.opp.gold, dmgWan:r.opp.dmgWan, dmgPct:r.opp.dmgPct,
             dmgRaw:r.opp.dmgRaw, tankRaw:r.opp.tankRaw, goldRaw:r.opp.goldRaw,
             tankPct:r.opp.tankPct, goldShare:r.opp.goldShare, kp:r.opp.kp },
    })),
    review: (document.querySelector("#ocrReview") || {}).innerText || "",
    mergeIssues: d && d.merge ? d.merge.issues : [],
    levels: d && d.merge ? { kills:d.merge.kills, scores:d.merge.scores } : null,
    mergeRows: d && d.merge ? d.merge.rows : null,
  };
});
const debug = await page.evaluate(() => window.PKC.clientDebug());
if (debug) {
  debug.forEach((p, pi) => {
    Object.entries(p.montages || {}).forEach(([variant, url]) => {
      const b64 = String(url).split(",")[1];
      if (b64) fs.writeFileSync(path.join(OUT, `page${pi}-${variant}.png`), Buffer.from(b64, "base64"));
    });
    if (p.heroMontage) {
      const b64 = String(p.heroMontage).split(",")[1];
      if (b64) fs.writeFileSync(path.join(OUT, `page${pi}-hero.png`), Buffer.from(b64, "base64"));
    }
  });
  result.debugSummary = debug.map(p => ({
    type: p.type, grid: p.grid, cells: p.cells, variants: p.variants,
    texts: p.texts, confidences: p.confidences,
  }));
}
const rawDebug = await page.evaluate(() => window.PKC.ocrDebug());
if (rawDebug && rawDebug.files && rawDebug.files[1]) {
  result.rawStatsWords = rawDebug.files[1].words
    .filter(w => /[\d%]/.test(w.t))
    .map(w => ({ t:w.t, x:w.x, y:w.y, c:w.c }))
    .slice(0, 120);
  result.allStatsWords = rawDebug.files[1].words
    .filter(w => w.y > 380 && w.y < 1600 && w.t && w.t.length < 12)
    .map(w => ({ t:w.t, x:w.x, y:w.y, c:w.c }))
    .slice(0, 220);
}

await page.screenshot({ path: path.join(OUT, "result.png"), clip: { x:0, y:0, width:1680, height:1050 } });
await browser.close();
console.log(JSON.stringify({ problems, state, seconds, ...result }, null, 2));


