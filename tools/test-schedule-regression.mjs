import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("ERR_FAILED")) errors.push("console: " + m.text());
});
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
  const a = s.teams[0].id, b = s.teams[1].id, c = s.teams[2].id;
  const br = window.PKC.bracket();
  br.draw[4] = { a, b };
  const g = window.PKC.openMatch("R16-5");
  g.ourId = c; g.oppId = b;                       // 人为制造队伍不一致
  window.PKC.renderGameBar();
  return {
    warn: document.querySelector("#matchWarn").textContent,
    issues: window.PKC.bkLinkIssues().length,
    ctx: window.PKC.contextSnapshot(),
  };
});
await browser.close();
console.log(JSON.stringify({ ...out, errors }, null, 2));
if (errors.length) throw new Error("页面出现错误：" + errors.join(" | "));
if (!out.warn.includes("赛程是")) throw new Error("队伍不一致未提示");
if (out.issues < 1) throw new Error("赛程关联冲突未统计");
if (out.ctx.matchKey !== "R16-5") throw new Error("上下文未指向 R16-5");


