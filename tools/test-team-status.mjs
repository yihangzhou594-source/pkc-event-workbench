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
  const br = window.PKC.bracket();
  br.groups.A[0] = a;
  br.draw[0] = { a, b };
  br.win["R16-1"] = "b";                    // b 赢，a 输 → a 淘汰
  window.PKC.syncTeamGroups();
  return {
    groupA: window.PKC.teamGroupOf(a),
    statusA: window.PKC.bkTeamStatus(a),
    statusB: window.PKC.bkTeamStatus(b),
    matchKeyA: window.PKC.bkTeamMatchKey(a),
    teamLabel: s.teams.find(t => t.id === a).group,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.groupA !== "A") throw new Error("teamGroupOf 未从 bracket.groups 推导");
if (out.statusA.state !== "out") throw new Error("16 强输家应标记为已淘汰");
if (out.statusB.wins !== 1) throw new Error("胜者胜场统计错误");
if (out.matchKeyA !== "R16-1") throw new Error("bkTeamMatchKey 未定位到该队场次");


