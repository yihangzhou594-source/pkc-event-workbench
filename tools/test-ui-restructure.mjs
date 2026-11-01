import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const port = process.env.PKC_TEST_PORT || "8971";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];

const noScript = await browser.newContext({
  javaScriptEnabled: false,
  viewport: { width: 1440, height: 900 },
});
const noScriptPage = await noScript.newPage();
await noScriptPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
const noScriptOverview = await noScriptPage.evaluate(() => {
  const pane = document.querySelector("#pane-overview");
  const title = document.querySelector("#ovSeries");
  return {
    paneVisible: !!pane && getComputedStyle(pane).visibility !== "hidden"
      && Number(getComputedStyle(pane).opacity) > 0,
    titleVisible: !!title && title.getBoundingClientRect().height > 0,
  };
});
await noScript.close();
if (!noScriptOverview.paneVisible || !noScriptOverview.titleVisible) {
  throw new Error("禁用 JavaScript 后概览不应变成空白");
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/api/store/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
await page.route("**/api/competition/context", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
    errors.push("console: " + message.text());
  }
});
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelectorAll("#ovSceneReadiness .wk-readiness-item").length === 6);
await page.screenshot({ path: path.resolve("tmp", "ui-restructure-overview-1440.png"), fullPage: true });
if (await page.locator("#wkNavToggle").isVisible()) {
  throw new Error("桌面端侧栏已展开时不应重复显示导航按钮");
}

const overview = await page.evaluate(() => {
  const command = document.querySelector(".wk-command");
  const readiness = document.querySelector("#ovSceneReadiness");
  const motionNode = document.querySelector(".wk-item");
  const guide = document.querySelector("details.wk-guide");
  return {
    hasCommand: !!command,
    readinessInCommand: !!readiness && !!readiness.closest(".wk-command"),
    hasEyebrow: !!document.querySelector(".wk-eyebrow"),
    hasGuideDisclosure: !!guide,
    transitionDuration: motionNode ? getComputedStyle(motionNode).transitionDuration : "",
  };
});
if (!overview.hasCommand || !overview.readinessInCommand) {
  throw new Error("概览首屏应以当前任务和开播准备组成调度面板");
}
if (overview.hasEyebrow || !overview.hasGuideDisclosure) {
  throw new Error("概览不应保留营销眉题，首次使用说明应改为按需展开");
}
const transitionSeconds = overview.transitionDuration
  .split(",")
  .map((value) => Number.parseFloat(value.trim()) || 0);
if (transitionSeconds.some((seconds) => seconds > 0.01)) {
  throw new Error("减少动态效果偏好下仍存在过渡动画");
}

await page.click('.wk-item[data-view="director"]');
await page.waitForFunction(() => window.__wkView === "director");
await page.screenshot({ path: path.resolve("tmp", "ui-restructure-director-1440.png") });
await page.click('.wk-item[data-view="data"]');
await page.waitForFunction(() => {
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  const win = frame && frame.contentWindow;
  return window.__wkView === "data" && doc && doc.querySelector("#panel-data.on")
    && typeof win?.PKC?.switchTab === "function";
}, null, { timeout: 15000 });
await page.screenshot({ path: path.resolve("tmp", "ui-restructure-data-1440.png") });
const previewModes = await page.evaluate(async () => {
  const win = document.querySelector("#genFrame").contentWindow;
  const layout = document.querySelector("#genFrame").contentDocument.querySelector(".layout");
  win.PKC.switchTab("teams");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const compact = layout.classList.contains("focus");
  win.PKC.switchTab("data");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const data = layout.classList.contains("focus");
  return { compact, data };
});
if (!previewModes.compact) {
  throw new Error("队伍管理页应自动收起右侧预览");
}
if (previewModes.data) {
  throw new Error("返回对局数据页时应恢复可用的画面预览");
}
await page.evaluate(() => document.querySelector("#genFrame").contentWindow.PKC.switchTab("teams"));
await page.waitForTimeout(100);
await page.screenshot({ path: path.resolve("tmp", "ui-restructure-teams-1440.png") });
await page.evaluate(() => document.querySelector("#genFrame").contentWindow.PKC.switchTab("data"));

const importPrimaryCount = await page.evaluate(() => {
  const doc = document.querySelector("#genFrame").contentDocument;
  return doc.querySelectorAll("#panel-data .import-card button.primary").length;
});
if (importPrimaryCount > 1) {
  throw new Error("截图导入区域存在多个同等权重的主按钮");
}
const scoreInput = page.frameLocator("#genFrame").locator("#inOurScore");
await scoreInput.fill("7");
await page.waitForFunction(() => {
  const doc = document.querySelector("#genFrame")?.contentDocument;
  return /保存失败/.test(doc?.querySelector("#status")?.textContent || "");
}, null, { timeout: 5000 });

const legend = await page.evaluate(() => {
  const doc = document.querySelector("#genFrame").contentDocument;
  const buttonText = ["btnTheme", "btnStyle", "btnAiOcr"]
    .map((id) => doc.querySelector("#" + id)?.textContent || "");
  return {
    labels: buttonText,
    emoji: buttonText.some((text) => /\p{Extended_Pictographic}/u.test(text)),
  };
});
if (legend.emoji) throw new Error("主要操作按钮仍使用 emoji 图标");

const failedEngine = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let blockEngine = true;
await failedEngine.route("**/generator?*", async (route) => {
  if (blockEngine) {
    await route.abort();
    return;
  }
  await route.continue();
});
await failedEngine.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await failedEngine.click('.wk-item[data-view="data"]');
const failedState = failedEngine.locator("#wkState");
await failedState.waitFor({ state: "visible", timeout: 10000 });
await failedEngine.screenshot({ path: path.resolve("tmp", "ui-restructure-error-1440.png") });
if (!(await failedState.innerText()).includes("加载失败")) {
  throw new Error("数据工作台加载失败时没有给出可恢复状态");
}
blockEngine = false;
await failedState.getByRole("button", { name: "重新加载" }).click();
await failedEngine.waitForFunction(() => {
  const frame = document.querySelector("#genFrame");
  return frame?.contentDocument?.querySelector("#panel-data.on");
}, null, { timeout: 15000 });

const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto(`http://127.0.0.1:${port}/?view=data`, { waitUntil: "load" });
await mobile.waitForFunction(() => {
  const frame = document.querySelector("#genFrame");
  return frame && frame.contentDocument?.querySelector("#panel-data.on");
}, null, { timeout: 15000 });
const mobileLayout = await mobile.evaluate(() => {
  const doc = document.querySelector("#genFrame").contentDocument;
  return {
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    frameOverflow: doc.documentElement.scrollWidth - doc.defaultView.innerWidth,
  };
});
if (mobileLayout.pageOverflow > 1 || mobileLayout.frameOverflow > 1) {
  throw new Error(`移动端出现横向溢出：${JSON.stringify(mobileLayout)}`);
}
await mobile.screenshot({ path: path.resolve("tmp", "ui-restructure-data-375.png") });
await mobile.click("#wkNavToggle");
await mobile.waitForFunction(() => document.querySelector(".wk-shell")?.classList.contains("nav-expanded"));
await mobile.waitForTimeout(250);
const mobileRail = await mobile.evaluate(() => {
  const rail = document.querySelector("#wkRail");
  return {
    width: rail.getBoundingClientRect().width,
    left: rail.getBoundingClientRect().left,
  };
});
if (mobileRail.width < 200 || mobileRail.left < 0) {
  throw new Error("移动端导航抽屉没有正常展开：" + JSON.stringify(mobileRail));
}
await mobile.screenshot({ path: path.resolve("tmp", "ui-restructure-nav-375.png") });

const loadingHero = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await loadingHero.route("**/api/hero-stats?*", async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await route.continue();
});
await loadingHero.goto(`http://127.0.0.1:${port}/herostats`, { waitUntil: "domcontentloaded" });
const heroLoadingText = await loadingHero.locator("#viewHeroes").innerText();
if (!heroLoadingText.includes("正在读取")) {
  throw new Error("英雄胜率页加载期间应显示可读的加载状态");
}
await loadingHero.waitForSelector("#viewHeroes tbody tr", { timeout: 15000 });
await loadingHero.close();

const detailPages = [
  { name: "herostats", path: "/herostats", ready: () => document.querySelector("#viewHeroes tbody tr") },
  { name: "season", path: "/season", ready: () => document.querySelector("#seasonStatus")?.textContent.includes("已更新") },
  { name: "promo", path: "/promo", ready: () => document.querySelector("#poster") },
];
const detailResults = {};
for (const spec of detailPages) {
  const detail = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await detail.goto(`http://127.0.0.1:${port}${spec.path}`, { waitUntil: "load" });
  await detail.waitForFunction(spec.ready, null, { timeout: 15000 });
  await detail.screenshot({ path: path.resolve("tmp", `ui-restructure-${spec.name}-1440.png`), fullPage: true });
  detailResults[spec.name] = await detail.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  if (detailResults[spec.name].overflow > 1) {
    throw new Error(`${spec.name} 桌面端出现横向溢出`);
  }
  await detail.close();

  const compactDetail = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await compactDetail.goto(`http://127.0.0.1:${port}${spec.path}`, { waitUntil: "load" });
  await compactDetail.waitForFunction(spec.ready, null, { timeout: 15000 });
  await compactDetail.screenshot({ path: path.resolve("tmp", `ui-restructure-${spec.name}-375.png`) });
  detailResults[spec.name].mobileOverflow = await compactDetail.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (detailResults[spec.name].mobileOverflow > 1) {
    throw new Error(`${spec.name} 移动端出现横向溢出`);
  }
  await compactDetail.close();
}

await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
console.log(JSON.stringify({ noScriptOverview, overview, previewModes, legend, mobileLayout, detailResults }, null, 2));
