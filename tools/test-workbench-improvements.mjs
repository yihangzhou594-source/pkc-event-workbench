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
const errors = [];
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
    errors.push("console: " + message.text());
  }
});
page.on("response", (response) => {
  const url = response.url();
  if (response.status() >= 400 && !url.includes("/api/tencent-heroes") && !url.includes("/tencent-hero/")) {
    errors.push(`response: ${response.status()} ${url}`);
  }
});
await page.route("**/api/store/**", (route) => {
  if (route.request().method() === "POST" && !route.request().url().includes("/audit")) {
    return route.abort();
  }
  return route.continue();
});
await page.route("**/api/competition/context", (route) => {
  if (route.request().method() === "POST") return route.abort();
  return route.continue();
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelectorAll("#ovSceneReadiness .wk-readiness-item").length === 6, null, { timeout: 15000 });
const overview = await page.evaluate(() => ({
  scenes: [...document.querySelectorAll("#ovSceneReadiness .wk-readiness-item")].map((node) => node.innerText),
  checks: document.querySelector("#ovChecks")?.children.length || 0,
  remoteText: document.querySelector("#remoteAccessBody")?.innerText || "",
}));
if (overview.scenes.length !== 6) throw new Error("概览应显示 6 个场景的预检结果");
if (!overview.scenes.some((text) => /就绪|注意|阻断/.test(text))) throw new Error("场景预检缺少状态文字");
if (!overview.remoteText.includes("127.0.0.1") && !overview.remoteText.includes("局域网已开启")) {
  throw new Error("概览缺少手机远程控制状态");
}

await page.click('.wk-item[data-view="director"]');
await page.waitForFunction(() => window.__wkView === "director");
const director = await page.evaluate(() => ({
  undo: !!document.querySelector("#btnUndoPush"),
  readiness: document.querySelectorAll("#directorReadiness .wk-readiness-item").length,
  shortcut: document.querySelector("#sceneList")?.innerText.includes("空格推送") || false,
}));
if (!director.undo || director.readiness !== 6 || !director.shortcut) {
  throw new Error("导播台缺少撤回、场景预检或快捷键提示");
}

await page.click('.wk-item[data-view="data"]');
await page.waitForFunction(() => {
  const doc = document.querySelector("#genFrame")?.contentDocument;
  const win = document.querySelector("#genFrame")?.contentWindow;
  return doc?.querySelector("#panel-data.on") && doc.querySelector("#importTools")
    && win?.PKC && typeof win.PKC.game === "function";
}, null, { timeout: 15000 });
const dataPage = page.frameLocator("#genFrame");
if (!await dataPage.locator("#btnImportToggle").isVisible()) throw new Error("导入工具缺少收起按钮");
await page.evaluate(() => {
  const win = document.querySelector("#genFrame").contentWindow;
  const game = win.PKC.game();
  game.duration = "99:99";
  game.rows[1].our.hero = game.rows[0].our.hero;
  game.rows[2].our.name = "";
  game.rows[3].our.hero = "";
  win.PKC.render();
});
await dataPage.locator("#issueList .issue-more").waitFor({ state: "attached", timeout: 5000 });
const initialIssueRows = await dataPage.locator("#issueList > .issue").count();
if (initialIssueRows > 3) throw new Error("待核对清单首屏不应超过 3 项");
const hasMore = await dataPage.locator("#issueList .issue-more").count();
if (!hasMore) throw new Error("待核对清单缺少其余项展开入口");
await dataPage.locator("#btnImportToggle").click();
if (!await dataPage.locator("#importTools").isHidden()) throw new Error("导入工具无法收起");
await dataPage.locator("#btnImportToggle").click();
if (!await dataPage.locator("#importTools").isVisible()) throw new Error("导入工具无法重新展开");

await page.click('.wk-item[data-view="bracket"]');
await page.waitForFunction(() => window.__wkView === "bracket");
await page.waitForTimeout(300);
const bracket = page.frameLocator("#genFrame");
if (await bracket.locator(".bracket-help").count() < 3) throw new Error("赛程规则说明没有折叠");

await page.click('.wk-item[data-view="season"]');
await page.waitForFunction(() => {
  const frame = document.querySelector("#seasonFrame");
  return window.__wkView === "season" && frame?.contentWindow?.PKC_SEASON
    && frame.contentWindow.PKC_SEASON.insights();
}, null, { timeout: 15000 });
const seasonFrame = page.frameLocator("#seasonFrame");
const season = await page.evaluate(() => {
  const win = document.querySelector("#seasonFrame").contentWindow;
  const data = win.PKC_SEASON.insights();
  return {
    series: data.meta.seriesId,
    officialMatches: data.meta.officialMatches,
    validGames: data.dataQuality.validGames,
    canvases: [...document.querySelector("#seasonFrame").contentDocument.querySelectorAll("canvas")]
      .map((canvas) => [canvas.width, canvas.height]),
  };
});
if (!season.series || season.canvases.length !== 6) throw new Error("赛季仪表盘没有生成六张画布");
if (season.canvases.slice(0, 5).some(([width, height]) => width !== 1920 || height !== 1080)) {
  throw new Error("赛季五张主图尺寸应为 1920×1080");
}
if (season.canvases[5][0] !== 1080 || season.canvases[5][1] !== 1350) {
  throw new Error("赛季总结海报尺寸应为 1080×1350");
}
if (!await seasonFrame.locator("#seasonStatus").innerText().then((text) => text.includes("已更新"))) {
  throw new Error("赛季仪表盘没有完成数据加载");
}
await seasonFrame.locator("#seasonStage").selectOption("group");
await page.waitForFunction(() => document.querySelector("#seasonFrame")?.contentWindow?.PKC_SEASON?.insights()?.meta?.stageFilter === "group");
await seasonFrame.locator("#seasonStage").selectOption("knockout");
await page.waitForFunction(() => document.querySelector("#seasonFrame")?.contentWindow?.PKC_SEASON?.insights()?.meta?.stageFilter === "knockout");
const [seasonDownload] = await Promise.all([
  page.waitForEvent("download"),
  seasonFrame.locator("#btnSeasonZip").click(),
]);
const seasonZip = fs.readFileSync(await seasonDownload.path());
if (seasonZip.subarray(0, 4).toString("hex") !== "504b0304") throw new Error("赛季仪表盘 ZIP 导出无效");

await page.click('.wk-item[data-view="out"]');
await page.waitForFunction(() => window.__wkView === "out");
const outFrame = page.frameLocator("#genFrame");
if (!await outFrame.locator("#btnDataHistory").isVisible()) throw new Error("缺少历史版本入口");
if (!await outFrame.locator("#btnBackupJson").isVisible()) throw new Error("缺少完整 JSON 备份入口");
await outFrame.locator("#btnDataHistory").click();
await outFrame.locator(".pkc-recovery-dialog").waitFor({ state: "visible", timeout: 10000 });
await outFrame.locator(".backup-option").first().waitFor({ state: "visible", timeout: 10000 });
if (await outFrame.locator(".backup-option").count() === 0) throw new Error("历史版本对话框没有版本记录");
if (!await outFrame.locator(".pkc-audit-list").isVisible()) throw new Error("历史版本对话框缺少操作记录");
await outFrame.locator("[data-recovery-close]").click();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  outFrame.locator("#btnBackupJson").click(),
]);
const backupPath = await download.path();
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
if (backup.format !== "pkc-full-backup" || backup.version !== 1
  || !backup.data.library || !backup.data.matches || !backup.data.bracket || !backup.data.heroStats) {
  throw new Error("完整 JSON 备份缺少必要数据");
}

const canvas = await page.evaluate(() => {
  const frame = document.querySelector("#genFrame");
  const win = frame.contentWindow;
  const game = win.PKC.game();
  const c = win.PKC.drawExport({ kind:"card", idx:0, game, label:"上单对位图" }, 1920, 1080);
  return { width: c.width, height: c.height, alpha: c.getContext("2d").getImageData(10, 10, 1, 1).data[3] };
});
if (canvas.width !== 1920 || canvas.height !== 1080 || !canvas.alpha) {
  throw new Error("1920×1080 对位图未正常绘制");
}

await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
console.log(JSON.stringify({ overview, director, dataPage: { initialIssueRows, hasMore }, bracket:true, season, canvas }, null, 2));
