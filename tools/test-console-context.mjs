import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const API = "http://127.0.0.1:8971";
const contextFile = path.resolve("数据", "context.json");
const originalContextText = fs.readFileSync(contextFile, "utf8");
const restoreContext = { ...JSON.parse(originalContextText) };
delete restoreContext.revision;

const ctx = {
  seriesId: "nb24ulp",
  seriesName: "2026 薄扶林王者杯",
  matchKey: "R16-5",
  matchLabel: "16强5 · 等我刷把电刀 vs 别让我取名",
  matchRound: "16强赛",
  blueTeam: "等我刷把电刀",
  redTeam: "别让我取名",
};

let browser;
try {
  const contextResponse = await fetch(API + "/api/director/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ctx),
  });
  if (!contextResponse.ok) throw new Error("设置测试上下文失败：" + await contextResponse.text());

  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  await page.route("**/api/store/**", (r) =>
    r.request().method() === "POST" ? r.abort() : r.continue());
  await page.goto(API + "/director", { waitUntil: "load" });
  await page.waitForFunction(() => window.__pkDirectorReady, null, { timeout: 20000 });
  await page.waitForFunction(
    (blue) => document.querySelector("#ivBlue") && document.querySelector("#ivBlue").value === blue,
    ctx.blueTeam,
    { timeout: 8000 },
  );
  const out = await page.evaluate(() => ({
    chip: document.querySelector("#ctxChip").textContent,
    follow: document.querySelector("#ivFollow").checked,
    blue: document.querySelector("#ivBlue").value,
    red: document.querySelector("#ivRed").value,
  }));
  console.log(JSON.stringify(out, null, 2));

  if (!out.chip.includes("16强5")) throw new Error("顶部上下文条未显示场次");
  if (!out.follow) throw new Error("赛间板跟随开关默认应为开");
  if (out.blue !== ctx.blueTeam || out.red !== ctx.redTeam) throw new Error("赛间板未跟随上下文");
} finally {
  if (browser) await browser.close();
  if (restoreContext.seriesId) {
    await fetch(API + "/api/director/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restoreContext),
    });
  }
  fs.writeFileSync(contextFile, originalContextText, "utf8");
}
