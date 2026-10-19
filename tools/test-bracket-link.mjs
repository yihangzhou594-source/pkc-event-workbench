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
  g1.ourId = a; g1.oppId = b; g1.result = "win"; g1.ourScore = "12"; g1.oppScore = "8";
  const g2 = window.PKC.newGame("第2局", "R16-5");
  g2.ourId = a; g2.oppId = b; g2.result = "lose"; g2.ourScore = "7"; g2.oppScore = "10";
  s.games.push(g2); s.current = s.games.length - 1;
  window.PKC.renderBracket();
  return {
    rec: window.PKC.matchRecord("R16-5"),
    list: window.PKC.bkMatchList().length,
    hasRowButton: !!document.querySelector('.bk-data[data-k="R16-5"]'),
    hasSync: !!document.querySelector('.bk-sync[data-k="R16-5"]'),
    issues: window.PKC.bkLinkIssues().length,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.rec.games !== 2 || out.rec.a !== 1 || out.rec.b !== 1) throw new Error("matchRecord 统计错误");
if (!out.hasRowButton || !out.hasSync) throw new Error("赛程行缺少录数据/回填按钮");


