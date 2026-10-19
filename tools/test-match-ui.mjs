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
  const t = s.teams;
  const a = t[0].id, b = t[1].id;
  const br = window.PKC.bracket();
  br.draw[4] = { a, b };
  const before = s.games.length;
  const g1 = window.PKC.openMatch("R16-5");
  const after1 = s.games.length;
  const g2 = window.PKC.newGame("第2局", "R16-5");
  s.games.push(g2);
  s.current = s.games.length - 1;
  window.PKC.renderGameBar();
  return {
    before,
    after1,
    key1: g1 && g1.matchKey,
    blue1: g1 && g1.ourId,
    red1: g1 && g1.oppId,
    label1: g1 && g1.label,
    chipCount: document.querySelectorAll("#gameBar .mini.primary").length,
    matchOptions: document.querySelector("#selMatch").options.length,
    selected: document.querySelector("#selMatch").value,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.after1 !== out.before + 1) throw new Error("openMatch 未新建局");
if (out.key1 !== "R16-5" || out.blue1 === "" || out.red1 === "") throw new Error("新局未带入赛程队伍");
if (out.label1 !== "第1局") throw new Error("新局标签不是第1局");
if (out.selected !== "R16-5") throw new Error("场次下拉未选中 R16-5");


