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

const before = await page.evaluate(() => ({
  captureButtons: !!document.querySelector("#btnStart, #btnPause, #btnStop"),
  dateInput: !!document.querySelector("#mDate, [name=date]"),
  matchOptions: document.querySelectorAll("#mMatch option").length,
  tabs: Array.from(document.querySelectorAll(".tab")).map((tab) => tab.dataset.tab),
  heroRows: document.querySelectorAll("#viewHeroes tbody tr").length,
  playerRows: document.querySelectorAll("#viewPlayers tbody tr").length,
  playerText: (document.querySelector("#viewPlayers") || {}).textContent || "",
  rankText: (document.querySelector("#viewHeroRank") || {}).textContent || "",
}));

if (before.captureButtons) throw new Error("抓取按钮仍然存在");
if (before.dateInput) throw new Error("日期输入框仍然存在");
if (before.matchOptions < 2) throw new Error("没有生成小组赛场次");
if (before.tabs.join(",") !== "heroes,players,heroRank,manual") throw new Error("榜单或手动录入标签缺失");
if (before.heroRows < 1) throw new Error("英雄榜没有数据");
if (before.playerRows < 1) throw new Error("选手英雄池没有数据");
if (!before.playerText.includes("（胜率")) throw new Error("选手英雄池格式不正确");
if (!before.rankText.includes("（使用") || !before.rankText.includes("胜率")) throw new Error("英雄排行榜格式不正确");

await page.click('.tab[data-tab="manual"]');
await page.selectOption("#mMatch", { index: 1 });
const manual = await page.evaluate(() => ({
  fieldsVisible: !document.querySelector("#mManualFields").hidden,
  left: document.querySelector("#mTeamLeftName").textContent,
  right: document.querySelector("#mTeamRightName").textContent,
  info: document.querySelector("#mMatchInfo").textContent,
  playerOptions: document.querySelectorAll("#playerNamesLeft option").length,
}));
if (!manual.fieldsVisible) throw new Error("选择小组赛后没有显示录入区");
if (!manual.left || !manual.right || !manual.info) throw new Error("场次信息未带入");
if (manual.playerOptions < 1) throw new Error("选手候选项未带入");

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
console.log(JSON.stringify({ ok: true, screenshot, ...before, manual, eliminated }, null, 2));
