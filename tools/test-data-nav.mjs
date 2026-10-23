import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const port = process.env.PKC_TEST_PORT || "8971";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.route("**/api/store/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
const errors = [];
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
    errors.push("console: " + message.text());
  }
});
page.on("response", (response) => {
  if (response.url().includes("/generator") && response.status() >= 400) {
    errors.push(`generator response: ${response.status()}`);
  }
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.click('.wk-item[data-view="data"]');
await page.waitForFunction(() => {
  const pane = document.querySelector("#pane-engine");
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return pane && pane.classList.contains("on") && frame && frame.src.includes("/generator")
    && doc && doc.querySelector('.tab[data-tab="data"].on')
    && doc.querySelector("#panel-data.on");
}, null, { timeout: 12000 }).catch(() => {});

const out = await page.evaluate(() => {
  const pane = document.querySelector("#pane-engine");
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return {
    view: window.__wkView,
    paneOn: !!pane && pane.classList.contains("on"),
    frameSrc: frame ? frame.src : "",
    dataTabOn: !!doc && !!doc.querySelector('.tab[data-tab="data"].on'),
    dataPanelOn: !!doc && !!doc.querySelector("#panel-data.on"),
    frameTitle: doc ? doc.title : "",
  };
});

const score = page.frameLocator("#genFrame").locator("#inOurScore");
await score.click();
await score.fill("7");
const inputValue = await score.inputValue();

await page.click('.wk-item[data-view="herostats"]');
await page.waitForFunction(() => window.__wkView === "herostats");
await page.click('.wk-item[data-view="data"]');
await page.waitForFunction(() => window.__wkView === "data");
const reentered = await page.evaluate(() => {
  const pane = document.querySelector("#pane-engine");
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return {
    paneOn: !!pane && pane.classList.contains("on"),
    dataTabOn: !!doc && !!doc.querySelector('.tab[data-tab="data"].on'),
    dataPanelOn: !!doc && !!doc.querySelector("#panel-data.on"),
  };
});

const direct = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await direct.goto(`http://127.0.0.1:${port}/?view=data`, { waitUntil: "load" });
await direct.waitForFunction(() => {
  const pane = document.querySelector("#pane-engine");
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return pane && pane.classList.contains("on") && doc
    && doc.querySelector('.tab[data-tab="data"].on') && doc.querySelector("#panel-data.on");
}, null, { timeout: 12000 }).catch(() => {});
const directOut = await direct.evaluate(() => ({
  view: window.__wkView,
  paneOn: document.querySelector("#pane-engine")?.classList.contains("on") || false,
  frameSrc: document.querySelector("#genFrame")?.src || "",
  dataTabOn: !!document.querySelector("#genFrame")?.contentDocument?.querySelector('.tab[data-tab="data"].on'),
  dataPanelOn: !!document.querySelector("#genFrame")?.contentDocument?.querySelector("#panel-data.on"),
}));

const compact = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await compact.route("**/api/store/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
await compact.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await compact.click("#wkNavToggle");
await compact.click('.wk-item[data-view="data"]');
await compact.waitForFunction(() => {
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return window.__wkView === "data" && doc && doc.querySelector("#panel-data.on");
}, null, { timeout: 12000 }).catch(() => {});
const compactOut = await compact.evaluate(() => ({
  view: window.__wkView,
  paneOn: document.querySelector("#pane-engine")?.classList.contains("on") || false,
  dataPanelOn: !!document.querySelector("#genFrame")?.contentDocument?.querySelector("#panel-data.on"),
}));

const recovery = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
let blockGenerator = true;
let generatorRequestsAfterRecovery = 0;
const generatorRequests = [];
await recovery.route("**/generator?*", async (route) => {
  generatorRequests.push(route.request().url());
  if (blockGenerator) {
    await route.abort();
    return;
  }
  generatorRequestsAfterRecovery++;
  await route.continue();
});
await recovery.route("**/api/store/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
await recovery.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await recovery.evaluate(() => {
  window.__dataNavClicks = 0;
  document.querySelector('.wk-item[data-view="data"]').addEventListener("click", () => {
    window.__dataNavClicks++;
  });
});
await recovery.click('.wk-item[data-view="data"]');
await recovery.waitForTimeout(400);
blockGenerator = false;
await recovery.click('.wk-item[data-view="data"]');
await recovery.waitForFunction(() => {
  const frame = document.querySelector("#genFrame");
  const doc = frame && frame.contentDocument;
  return doc && doc.querySelector("#panel-data.on");
}, null, { timeout: 12000 }).catch(() => {});
const recoveryOut = await recovery.evaluate(() => {
  const frame = document.querySelector("#genFrame");
  let frameSwitchType = "blocked";
  try { frameSwitchType = typeof frame?.contentWindow?.switchTab; } catch {}
  return {
    clicks: window.__dataNavClicks,
    frameSrc: frame?.src || "",
    frameAttr: frame?.getAttribute("src") || "",
    frameSwitchType,
    dataPanelOn: !!frame?.contentDocument?.querySelector("#panel-data.on"),
  };
});

await browser.close();
console.log(JSON.stringify({
  out, inputValue, reentered, direct: directOut, compact: compactOut,
  recovery: { ...recoveryOut, generatorRequestsAfterRecovery, generatorRequests }, errors,
}, null, 2));

if (out.view !== "data") throw new Error("侧栏点击后未切到对局数据视图");
if (!out.paneOn) throw new Error("对局数据面板未显示");
if (!out.frameSrc.includes("/generator")) throw new Error("生成器 iframe 未加载");
if (!out.dataTabOn || !out.dataPanelOn) throw new Error("生成器内的对局数据页未激活");
if (inputValue !== "7") throw new Error("对局数据表单无法点击或输入");
if (!reentered.paneOn || !reentered.dataTabOn || !reentered.dataPanelOn) {
  throw new Error("从英雄胜率返回对局数据后页面未激活");
}
if (!directOut.paneOn || !directOut.dataTabOn || !directOut.dataPanelOn) {
  throw new Error("直接打开对局数据地址后页面未激活");
}
if (compactOut.view !== "data" || !compactOut.paneOn || !compactOut.dataPanelOn) {
  throw new Error("窄屏侧栏无法进入对局数据");
}
if (!recoveryOut.dataPanelOn || generatorRequestsAfterRecovery < 1) {
  throw new Error("生成器首次加载失败后，再次点击未能重试恢复");
}
if (errors.length) throw new Error(errors.join("\n"));
