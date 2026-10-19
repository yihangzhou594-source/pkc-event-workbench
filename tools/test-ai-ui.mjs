import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const [gear, stats] = process.argv.slice(2);
if (!gear || !stats) process.exit(1);
const browser = await chromium.launch({ channel:"msedge", headless:true });
const page = await browser.newPage({ viewport:{ width:1680, height:1050 } });
await page.route("**/api/store/**", r => r.request().method() === "POST" ? r.abort() : r.continue());
const url = "http://127.0.0.1:8971/generator";
await page.goto(url, { waitUntil:"load" });
await page.waitForFunction(() => window.PKC, null, { timeout:20000 });
await page.setInputFiles("#fileShot", [gear, stats]);
await page.waitForFunction(() => /AI 识别完成|AI 识别失败/.test(document.querySelector("#ocrMsg").textContent),
  null, { timeout:180000 });
const out = await page.evaluate(() => ({
  msg: document.querySelector("#ocrMsg").textContent,
  scores: [window.PKC.game().ourScore, window.PKC.game().oppScore],
  rows: window.PKC.game().rows.map(r => ({
    pos:r.pos, blue:r.our.name, blueHero:r.our.hero, blueKda:[r.our.k,r.our.d,r.our.a].join("/"),
    red:r.opp.name, redHero:r.opp.hero, redKda:[r.opp.k,r.opp.d,r.opp.a].join("/"),
  })),
}));
await browser.close();
console.log(JSON.stringify(out, null, 2));


