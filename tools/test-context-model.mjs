import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route("**/api/store/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.route("**/api/director/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.goto("http://127.0.0.1:8971/generator", {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const g = window.PKC.game();
  const ng = window.PKC.normGame({ id: "t1", label: "第1局", matchKey: "R16-5", rows: [] }, 0);
  const ng2 = window.PKC.newGame("第2局", "R16-5");
  const ctx = window.PKC.contextSnapshot();
  const items = window.PKC.chartItems();
  return {
    gameHasMatchKey: Object.prototype.hasOwnProperty.call(g, "matchKey"),
    normMatchKey: ng.matchKey,
    newMatchKey: ng2.matchKey,
    newLabel: ng2.label,
    ctxHasMatchKey: !!(ctx && Object.prototype.hasOwnProperty.call(ctx, "matchKey")),
    ctxSeriesId: ctx && ctx.seriesId,
    chartGame: items[0] && items[0].gameLabel,
    chartMatch: items[0] && items[0].matchKey,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (!out.gameHasMatchKey) throw new Error("game 缺少 matchKey");
if (out.normMatchKey !== "R16-5") throw new Error("normGame 未保留 matchKey");
if (out.newMatchKey !== "R16-5" || out.newLabel !== "第2局") throw new Error("newGame 参数错误");
if (!out.ctxHasMatchKey || !out.ctxSeriesId) throw new Error("contextSnapshot 不完整");
if (out.chartGame !== "第1局" || out.chartMatch !== "") throw new Error("chartItems 未带当前场次");


