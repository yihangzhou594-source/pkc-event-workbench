import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const browser = await chromium.launch({ channel:"msedge", headless:true });
const page = await browser.newPage({ viewport:{ width:1200, height:800 } });
await page.route("**/api/store/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.route("**/api/director/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
const url = "http://127.0.0.1:8971/generator";
await page.goto(url, { waitUntil:"load" });
await page.waitForFunction(() => window.PKC, null, { timeout:20000 });
const out = await page.evaluate(() => {
  const g = window.PKC.game();
  g.rows.forEach(r => { r.pos = ""; r.posOpp = ""; });
  const a = window.PKC.autoMatchHeroLanes("our", true);
  const b = window.PKC.autoMatchHeroLanes("opp", true);
  return { a, b, lanes:g.rows.map(r => [r.our.name, r.our.hero, r.pos, r.opp.name, r.opp.hero, r.posOpp]) };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));


