import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ctx = {
  seriesId: "nb24ulp",
  seriesName: "2026 薄扶林王者杯",
  matchKey: "R16-5",
  matchLabel: "16强5 · 等我刷把电刀 vs 别让我取名",
  gameLabel: "第2局",
  blueTeam: "等我刷把电刀",
  redTeam: "别让我取名",
};
const API = "http://127.0.0.1:8971";
const contextFile = path.resolve("数据", "context.json");
const originalContextText = fs.readFileSync(contextFile, "utf8");
const originalContext = JSON.parse(originalContextText);
const restoreContext = { ...originalContext };
delete restoreContext.revision;
async function post(path, body) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} 失败：${await response.text()}`);
}

const before = await (await fetch(API + "/api/director/state")).json();
const prevOnAir = before.onAir.scene;
const prevPreview = before.preview.scene;

let browser;
try {
  await post("/api/director/context", ctx);
  await post("/api/director/scene", { id: "bracket" });
  await post("/api/director/push");

  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(API + "/obs/bracket", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => ({
    active: !!document.querySelector(".bk-active"),
    activeKey: document.querySelector(".bk-active")?.dataset.key || "",
  }));
  console.log(JSON.stringify(out, null, 2));
  if (!out.active || out.activeKey !== "R16-5") throw new Error("赛程图未高亮当前场次");
} finally {
  if (browser) await browser.close();
  await post("/api/director/scene", { id: prevOnAir });
  await post("/api/director/push");
  await post("/api/director/scene", { id: prevPreview });
  if (restoreContext.seriesId) {
    await fetch(API + "/api/director/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restoreContext),
    });
  }
  fs.writeFileSync(contextFile, originalContextText, "utf8");
}
