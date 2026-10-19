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
  const opts = [...document.querySelector("#inOurTeam").options].map(o => o.value);
  const addBtn = [...document.querySelectorAll("#gameBar .mini")]
    .find(x => x.textContent.includes("新一局"));
  addBtn.click();
  const g2 = window.PKC.game();
  const g2ids = [g2.ourId, g2.oppId];
  const blueAfterNew = document.querySelector("#inOurTeam").value;
  document.querySelector("#btnSwapTop").click();
  const g3ids = [window.PKC.game().ourId, window.PKC.game().oppId];
  return {
    optionIds: opts.filter(Boolean),
    g1: [g1.ourId, g1.oppId],
    g2: g2ids,
    blueAfterNew,
    afterSwap: g3ids,
    swapVisible: !!document.querySelector("#btnSwapTop"),
    games: s.games.map(g => [g.label, g.matchKey, g.ourId, g.oppId]),
    current: s.current,
    currentId: window.PKC.game().id,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

const onlyAB = out.optionIds.length === 2 && out.g1.every(id => out.optionIds.includes(id));
if (!onlyAB) throw new Error("赛程场次下队伍下拉没有收敛到两队");
if (out.g2[0] !== out.g1[1] || out.g2[1] !== out.g1[0]) throw new Error("新建小局未自动交换红蓝");
if (out.blueAfterNew !== out.g2[0]) throw new Error("互换后下拉未同步");
if (out.afterSwap[0] !== out.g1[0] || out.afterSwap[1] !== out.g1[1]) throw new Error("交换按钮未生效");
if (!out.swapVisible) throw new Error("缺少顶部交换按钮");


