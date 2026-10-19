import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8971/obs/bp?mode=preview", { waitUntil: "load" });
await page.waitForTimeout(800);

const out = await page.evaluate(() => {
  const live = { context: { matchLabel: "16强5 · A vs B", gameLabel: "第2局" } };
  const bp = {
    teams: { blue: "A", red: "B" },
    picks: { blue: ["敖隐"], red: ["虞姬"] },
    bans: { blue: [], red: [] },
    config: { banCount: 5 },
    ruleTitle: "BO7",
    ruleLines: [],
  };
  renderBp2(bp, live);
  const bpCtx = document.querySelector(".b2-ctx")?.textContent || "";
  renderLineup(bp, live);
  const luCtx = document.querySelector(".lu-ctx")?.textContent || "";
  renderInterval({ blueTeam: "A", redTeam: "B" }, live);
  const ivKicker = document.querySelector(".iv-stage-kicker")?.textContent || "";
  return { bpCtx, luCtx, ivKicker };
});

await browser.close();
console.log(JSON.stringify({ ...out, errors }, null, 2));
if (errors.length) throw new Error("OBS 场景出现错误：" + errors.join(" | "));
if (!out.bpCtx.includes("16强5") || !out.luCtx.includes("16强5") || !out.ivKicker.includes("16强5")) {
  throw new Error("OBS 场景未显示当前场次");
}
