import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
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
  const a = s.teams[0].id, b = s.teams[1].id;
  window.PKC.bracket().draw[4] = { a, b };
  const g1 = window.PKC.openMatch("R16-5");
  g1.rows[0].our.k = "1";
  const g2 = window.PKC.newGame("第2局", "R16-5");
  g2.rows[0].our.k = "2";
  s.games.push(g2);
  const other = window.PKC.newGame("第1局", "R16-1");
  other.rows[0].our.k = "9";
  s.games.push(other);
  s.current = s.games.indexOf(g2);
  return {
    multi: window.PKC.multiGames().length,
    keys: window.PKC.multiGames().map(g => g.matchKey),
    exportAll: window.PKC.exportList(true).length,
    exportOne: window.PKC.exportList(false).length,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.multi !== 2 || out.keys.some(k => k !== "R16-5")) throw new Error("多局范围未收敛到本场");
if (out.exportAll !== 12) throw new Error("本场两局应导出 12 张（每局 5 对位 + 总览）");
if (out.exportOne !== 6) throw new Error("当前局应导出 6 张");


