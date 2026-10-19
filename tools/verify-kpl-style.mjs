import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const OUT = path.join(ROOT, "tmp", "kpl-style-20261018");
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = [
  "我方\t上单\t图南\t吕布\t5\t2\t7\t7911\t652\t24.5%\t19.3%\t23.0%\t80.0%\t-\t6.76",
  "对方\t上单\t主峰城\t关羽\t3\t4\t5\t6349\t615\t29.4%\t5.8%\t14.8%\t86.7%\t-\t10.06",
].join("\n");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.route("**/api/store/**", r => r.request().method() === "POST" ? r.abort() : r.continue());
const url = "http://localhost:8971/generator";
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });
await page.evaluate((txt) => {
  window.PKC.parseLines(txt);
  window.PKC.game().duration = "16:02";
  window.PKC.game().ourScore = "3";
  window.PKC.game().oppScore = "14";
  window.PKC.db().prefs.chartStyle = "kpl";
  window.PKC.render();
}, SAMPLE);
await page.waitForTimeout(2500);
const data = await page.evaluate(() => {
  const c = window.PKC.drawExport({ kind:"card", game:window.PKC.game(), idx:0 }, 1920, 1080);
  return c.toDataURL("image/png");
});
fs.writeFileSync(path.join(OUT, "kpl-style-card.png"), Buffer.from(data.split(",")[1], "base64"));
await page.screenshot({ path:path.join(OUT, "kpl-style-ui.png"), clip:{ x:0, y:0, width:1680, height:1050 } });
await browser.close();
console.log(JSON.stringify({ ok:true, file:path.join(OUT, "kpl-style-card.png") }, null, 2));


