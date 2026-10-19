/**
 * 浏览器内 OCR 端到端验证：把一张截图喂给「拖拽识别」入口，等识别结果并检查填充情况。
 * 用法： node tools/verify-ocr.mjs "<图片路径>"
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const img = process.argv[2];
if (!img || !fs.existsSync(img)) { console.error("用法: node tools/verify-ocr.mjs <图片>"); process.exit(1); }

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const problems = [];
page.on("console", m => { if (m.type() === "error") problems.push("console: " + m.text()); });
page.on("pageerror", e => problems.push("pageerror: " + e.message));

await page.goto("http://localhost:8971/", { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const t0 = Date.now();
await page.setInputFiles("#fileShot", img);

let state = "timeout";
try {
  await page.waitForFunction(
    () => /识别完成|识别失败|不可用/.test(document.querySelector("#ocrMsg").textContent),
    null, { timeout: 240000 });
  state = await page.$eval("#ocrMsg", el => el.textContent);
} catch (e) { state = "等待超时"; }
const secs = ((Date.now()-t0)/1000).toFixed(1);

const result = await page.evaluate(() => {
  const g = window.PKC.game();
  return {
    pasteLines: document.querySelector("#pasteBox").value.split("\n").filter(Boolean).length,
    paste: document.querySelector("#pasteBox").value.slice(0, 700),
    duration: g.duration,
    filled: g.rows.map(r => [r.pos,
      r.our.name, r.our.hero, [r.our.k,r.our.d,r.our.a].join("/"), r.our.gold,
      r.opp.name, r.opp.hero, [r.opp.k,r.opp.d,r.opp.a].join("/"), r.opp.gold]),
    ocrText: (document.querySelector("#ocrReview pre") || {}).textContent?.slice(0, 1200) || ""
  };
});

await page.screenshot({ path: path.join(ROOT, "预览", "_OCR识别结果.png"), clip: { x:0, y:0, width:1680, height:1050 } });
await browser.close();

console.log(JSON.stringify({ problems, state, seconds: secs, ...result }, null, 2));
