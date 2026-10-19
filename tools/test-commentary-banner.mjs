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

async function setCommentary(patch) {
  await post("/api/director/settings", { id: "commentary", patch });
  await post("/api/director/scene", { id: "commentary" });
  await post("/api/director/push");
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let sub;
let ach;
let stability;
try {
  await setCommentary({
    count: 3,
    banner: { visible: false, type: "substitution", team: "赢不了也输不起", lane: "打野", outPlayer: "灭霸", inPlayer: "子默" },
  });
  await page.goto(API + "/obs/commentary", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => {
    const r = document.querySelector(".st-caster")?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom } : null;
  });
  await setCommentary({
    count: 3,
    banner: { visible: true, type: "substitution", team: "赢不了也输不起", lane: "打野", outPlayer: "灭霸", inPlayer: "子默" },
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const r = document.querySelector(".st-caster")?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom } : null;
  });
  stability = { before, after };

  await setCommentary({
    count: 1,
    banner: {
      visible: true, type: "substitution", team: "赢不了也输不起",
      lane: "打野", outPlayer: "灭霸", inPlayer: "子默",
    },
  });
  await page.goto(API + "/obs/commentary", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  sub = await page.evaluate(() => ({
    seats: document.querySelectorAll(".st-seat").length,
    banner: !!document.querySelector(".st-banner.sub"),
    title: document.querySelector(".st-bn-teamtext b")?.textContent || "",
    out: document.querySelector(".st-bn-change.out b")?.textContent || "",
    in: document.querySelector(".st-bn-change.in b")?.textContent || "",
    teamLogos: document.querySelectorAll(".st-bn-logo").length,
  }));

  await setCommentary({
    count: 2,
    banner: {
      visible: true, type: "achievement", team: "别让我取名",
      title: "联赛 100 胜", content: "达成队史第 100 场胜利", player: "无氧致死_",
    },
  });
  await page.goto(API + "/obs/commentary", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  ach = await page.evaluate(() => ({
    seats: document.querySelectorAll(".st-seat").length,
    banner: !!document.querySelector(".st-banner.ach"),
    title: document.querySelector(".st-bn-achtext b")?.textContent || "",
    content: document.querySelector(".st-bn-achtext p")?.textContent || "",
    player: document.querySelector(".st-bn-achtext em")?.textContent || "",
    teamLogos: document.querySelectorAll(".st-bn-logo").length,
  }));
} finally {
  await browser.close();
  /* 测试会改解说人数和横幅；跑完恢复成干净状态，别把预置画面弄脏。 */
  await post("/api/director/settings", {
    id: "commentary",
    patch: {
      count: 3,
      banner: {
        visible: false, type: "substitution", team: "", lane: "打野",
        outPlayer: "", inPlayer: "", title: "", content: "", player: "",
      },
    },
  });
  await post("/api/director/scene", { id: prevOnAir });
  await post("/api/director/push");
  await post("/api/director/scene", { id: prevPreview });
}

console.log(JSON.stringify({ stability, sub, ach }, null, 2));
if (!stability.before || !stability.after
  || Math.abs(stability.before.top - stability.after.top) > 1
  || Math.abs(stability.before.bottom - stability.after.bottom) > 1) {
  throw new Error("横幅出现时解说姓名牌发生了位移");
}
if (sub.seats !== 1 || !sub.banner || sub.title !== "打野换人" || sub.out !== "灭霸" || sub.in !== "子默") {
  throw new Error("换人横幅 / 单人座位不正确");
}
if (sub.teamLogos !== 0) throw new Error("换人横幅不应出现队伍头像");
if (ach.seats !== 2 || !ach.banner || ach.title !== "联赛 100 胜" || ach.player !== "无氧致死_") {
  throw new Error("成就横幅 / 双人座位不正确");
}
if (ach.teamLogos !== 0) throw new Error("成就横幅不应出现队伍头像");
