import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const API = "http://127.0.0.1:8971";
async function post(pathname, body) {
  await fetch(API + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const before = await (await fetch(API + "/api/director/state")).json();
const prevOnAir = before.onAir.scene;
const prevPreview = before.preview.scene;

await post("/api/director/settings", {
  id: "commentary",
  patch: {
    title: "2026 薄扶林王者杯秋季赛",
    subtitle: "总决赛（BO7）",
    leftName: "洛七",
    leftRole: "解说",
    centerName: "钧杨",
    centerRole: "KPL 嘉宾",
    rightName: "溪妄",
    rightRole: "解说",
    count: 3,
    score: { blue: 2, red: 1, bo: 7 },
    banner: {
      visible: false, type: "substitution", team: "", lane: "打野",
      outPlayer: "", inPlayer: "", title: "", content: "", player: "",
    },
  },
});
await post("/api/director/scene", { id: "commentary" });
await post("/api/director/push");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let out;
try {
  await page.goto(API + "/obs/commentary", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  out = await page.evaluate(() => ({
    studio: !!document.querySelector(".st"),
    title: document.querySelector(".st-head h1")?.textContent || "",
    subtitle: document.querySelector(".st-head p")?.textContent || "",
    teams: [...document.querySelectorAll(".st-name")].map((x) => x.textContent),
    casters: [...document.querySelectorAll(".st-caster b")].map((x) => x.textContent),
    badges: document.querySelectorAll(".st-badge").length,
    score: document.querySelector(".st-score")?.textContent || "",
    scoreLabel: document.querySelector(".st-score-label")?.textContent || "",
    casterY: [...document.querySelectorAll(".st-caster")].map((x) => Math.round(x.getBoundingClientRect().top)),
    live: document.querySelector(".st-live")?.textContent || "",
    hasClock: !!document.querySelector(".st-live [class*=clock]"),
  }));
} finally {
  await browser.close();
  await post("/api/director/scene", { id: prevOnAir });
  await post("/api/director/push");
  await post("/api/director/scene", { id: prevPreview });
}
console.log(JSON.stringify(out, null, 2));

if (!out.studio) throw new Error("解说演播厅没有渲染");
if (!out.title.includes("薄扶林")) throw new Error("解说标题不正确");
if (out.casters.length !== 3) throw new Error("解说席应有 3 人");
if (out.badges !== 0) throw new Error("解说页不应再出现队伍圆形头像");
if (out.score !== "2:1") throw new Error("解说页没有显示导播手填的大场比分 2:1：" + out.score);
if (out.scoreLabel !== "BO7 · 大场比分") throw new Error("比分标签不正确：" + out.scoreLabel);
if (new Set(out.casterY).size !== 1) throw new Error("三位解说的姓名牌没有对齐");
if (!out.live.includes("LIVE")) throw new Error("右上角缺少 LIVE");
if (/\d{1,2}:\d{2}/.test(out.live)) throw new Error("右上角不应出现倒计时");
