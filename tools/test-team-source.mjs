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
  window.PKC.renderGameForm();
  const teams = s.teams;
  const target = teams[3];
  const before = teams.length;
  const sel = document.querySelector("#inOurTeam");
  sel.value = target.id;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    tag: sel.tagName,
    optionCount: sel.options.length,
    selected: sel.value,
    gameOurId: window.PKC.game().ourId,
    teamCount: window.PKC.series().teams.length,
    before,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.tag !== "SELECT") throw new Error("队名控件不是下拉");
if (out.gameOurId !== out.selected) throw new Error("选择队伍后未写入 game.ourId");
if (out.teamCount !== out.before) throw new Error("选择队伍不应新建队伍");


