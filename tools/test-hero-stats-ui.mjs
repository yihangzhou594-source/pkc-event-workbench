import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const port = process.env.PKC_TEST_PORT || "8971";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.goto(`http://127.0.0.1:${port}/herostats`, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelectorAll("#mMatch option").length > 1, null, { timeout: 20000 });
await page.waitForSelector("#viewHeroes tbody tr", { timeout: 20000 });

const before = await page.evaluate(() => ({
  captureButtons: !!document.querySelector("#btnStart, #btnPause, #btnStop"),
  dateInput: !!document.querySelector("#mDate, [name=date]"),
  matchOptions: document.querySelectorAll("#mMatch option").length,
  tabs: Array.from(document.querySelectorAll(".tab")).map((tab) => tab.dataset.tab),
  heroRows: document.querySelectorAll("#viewHeroes tbody tr").length,
  heroText: (document.querySelector("#viewHeroes") || {}).textContent || "",
  teamRows: document.querySelectorAll("#viewTeams tbody tr").length,
  teamText: (document.querySelector("#viewTeams") || {}).textContent || "",
  rankText: (document.querySelector("#viewHeroRank") || {}).textContent || "",
  playerInputs: document.querySelectorAll("#viewManual .pname").length,
}));

if (before.captureButtons) throw new Error("抓取按钮仍然存在");
if (before.dateInput) throw new Error("日期输入框仍然存在");
if (before.matchOptions < 2) throw new Error("没有生成小组赛场次");
if (before.tabs.join(",") !== "heroes,teams,heroRank,manual,uploaded") {
  throw new Error("榜单、手动录入或赛事禁用标签缺失");
}
if (before.heroRows < 1) throw new Error("英雄榜没有数据");
if (!before.heroText.includes("赵怀真")) throw new Error("对局数据上传的英雄没有自动进入英雄胜率");
if (before.teamRows < 1) throw new Error("队伍英雄池没有数据");
if (!before.teamText.includes("（胜率")) throw new Error("队伍英雄池格式不正确");
if (!before.rankText.includes("（使用") || !before.rankText.includes("胜率")) throw new Error("英雄排行榜格式不正确");
if (before.playerInputs) throw new Error("手动录入仍要求填写选手");

await page.click('.tab[data-tab="uploaded"]');
await page.waitForFunction(() => document.querySelectorAll("#uGame option").length > 1);
await page.selectOption("#uGame", { index: 1 });
const uploaded = await page.evaluate(() => ({
  fieldsVisible: !document.querySelector("#uFields").hidden,
  leftHeroes: document.querySelectorAll("#uLineupLeft .hero-chip").length,
  rightHeroes: document.querySelectorAll("#uLineupRight .hero-chip").length,
  leftBans: document.querySelectorAll("#uBansLeft input").length,
  rightBans: document.querySelectorAll("#uBansRight input").length,
  source: (document.querySelector("#uSource") || {}).textContent || "",
}));
if (!uploaded.fieldsVisible) throw new Error("选择上传局后没有显示禁用手填区");
if (uploaded.leftHeroes !== 5 || uploaded.rightHeroes !== 5) throw new Error("上传局没有自动带入双方各 5 个英雄");
if (uploaded.leftBans !== 5 || uploaded.rightBans !== 5) throw new Error("双方应各有 5 个禁用输入框");
if (!uploaded.source.includes("淘汰赛")) throw new Error("上传局没有归入淘汰赛");
const uploadedScreenshot = path.resolve("tmp", "hero-stats-uploaded-ui.png");
fs.mkdirSync(path.dirname(uploadedScreenshot), { recursive: true });
await page.screenshot({ path: uploadedScreenshot, fullPage: true });

await page.click('.tab[data-tab="manual"]');
await page.selectOption("#mMatch", { index: 1 });
const manual = await page.evaluate(() => ({
  fieldsVisible: !document.querySelector("#mManualFields").hidden,
  left: document.querySelector("#mTeamLeftName").textContent,
  right: document.querySelector("#mTeamRightName").textContent,
  info: document.querySelector("#mMatchInfo").textContent,
  pickInputs: document.querySelectorAll("#mPicksLeft .phero").length,
}));
if (!manual.fieldsVisible) throw new Error("选择小组赛后没有显示录入区");
if (!manual.left || !manual.right || !manual.info) throw new Error("场次信息未带入");
if (manual.pickInputs !== 5) throw new Error("每队应有 5 个选择英雄输入框");

const screenshot = path.resolve("tmp", "hero-stats-manual-ui.png");
fs.mkdirSync(path.dirname(screenshot), { recursive: true });
await page.screenshot({ path: screenshot, fullPage: true });

const eliminatedPage = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await eliminatedPage.route("**/api/hero-stats/schedule?*", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    ok: true,
    seriesId: "fixture",
    groups: [{ key: "A", name: "A组", teams: [], rounds: 1 }],
    matches: [{
      id: "fixture:A:r1:eliminated",
      group: "A组",
      round: "第1轮",
      gameNo: 1,
      left: { id: "a", name: "等我刷把电刀", eliminated: true },
      right: { id: "b", name: "薄肌俱乐部", eliminated: false },
      label: "A组 · 第1轮 · 等我刷把电刀（已淘汰） vs 薄肌俱乐部",
    }],
  }),
}));
await eliminatedPage.goto(`http://127.0.0.1:${port}/herostats`, { waitUntil: "load" });
await eliminatedPage.waitForFunction(() =>
  document.querySelector("#mMatch option[value='fixture:A:r1:eliminated']"));
await eliminatedPage.click('.tab[data-tab="manual"]');
await eliminatedPage.selectOption("#mMatch", "fixture:A:r1:eliminated");
const eliminated = await eliminatedPage.evaluate(() => {
  const option = document.querySelector("#mMatch option[value='fixture:A:r1:eliminated']");
  return {
    optionText: option.textContent,
    disabled: option.disabled,
    leftHeading: document.querySelector("#mTeamLeftNameCard").textContent,
    fieldsVisible: !document.querySelector("#mManualFields").hidden,
  };
});
if (eliminated.disabled || !eliminated.optionText.includes("（已淘汰）")) {
  throw new Error("已淘汰队伍的小组赛场次不可选择或缺少标识");
}
if (!eliminated.fieldsVisible || !eliminated.leftHeading.includes("（已淘汰）")) {
  throw new Error("已淘汰队伍未正确带入手动录入表单");
}

await browser.close();
console.log(JSON.stringify({ ok: true, screenshot, uploadedScreenshot, ...before, uploaded, manual, eliminated }, null, 2));
