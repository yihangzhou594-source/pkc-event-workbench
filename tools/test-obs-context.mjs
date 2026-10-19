import { createRequire } from "node:module";
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
async function post(path, body) {
  await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const before = await (await fetch(API + "/api/director/state")).json();
const prevOnAir = before.onAir.scene;
const prevPreview = before.preview.scene;

await post("/api/director/context", ctx);
await post("/api/director/scene", { id: "bracket" });
await post("/api/director/push");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let out;
try {
  await page.goto(API + "/obs/bracket", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  out = await page.evaluate(() => ({
    active: !!document.querySelector(".bk-active"),
    activeKey: document.querySelector(".bk-active")?.dataset.key || "",
  }));
} finally {
  await browser.close();
  await post("/api/director/scene", { id: prevOnAir });
  await post("/api/director/push");
  await post("/api/director/scene", { id: prevPreview });
}
console.log(JSON.stringify(out, null, 2));
if (!out.active || out.activeKey !== "R16-5") throw new Error("赛程图未高亮当前场次");
