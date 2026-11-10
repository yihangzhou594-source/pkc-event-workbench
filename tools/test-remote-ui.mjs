import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-remote-control-ui-"));
const sourceData = path.join(root, "数据");
for (const name of fs.readdirSync(sourceData)) {
  if (!name.endsWith(".json")) continue;
  fs.copyFileSync(path.join(sourceData, name), path.join(temp, name));
}
const port = 18000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PKC_PORT: String(port), PKC_REMOTE: "1", PKC_OPEN: "0", PKC_DATA_DIR: temp },
  stdio: "ignore",
  windowsHide: true,
});

const waitForServer = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/remote/access`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("远程测试服务未能启动");
};

let browser;
try {
  const access = await waitForServer();
  if (!access.enabled || access.host !== "0.0.0.0" || access.pin.length !== 6) {
    throw new Error("远程模式未监听局域网或未生成 6 位口令");
  }
  if (access.urls?.[0]?.url) {
    const lanBase = access.urls[0].url.replace("/remote", "");
    const lanResponse = await fetch(lanBase + "/api/remote/access");
    if (lanResponse.status !== 403) throw new Error("局域网来源不应读取访问口令");
    const lanData = await fetch(lanBase + "/api/store/library");
    if (lanData.status !== 403) throw new Error("局域网来源不应访问完整数据接口");
    const lanGenerator = await fetch(lanBase + "/generator");
    if (lanGenerator.status !== 403) throw new Error("局域网来源不应访问生成器");
  }
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/remote/state`);
  if (unauthorized.status !== 401) throw new Error("未配对会话应返回 401");
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/store/library`);
  if (forbidden.status === 401) throw new Error("本机读接口不应被远程会话规则误伤");

  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`http://127.0.0.1:${port}/remote`, { waitUntil: "load" });
  await page.fill("#pin", access.pin);
  await page.fill("#deviceName", "自动化手机");
  await page.click("#pairBtn");
  await page.waitForFunction(() => !document.querySelector("#controlView").classList.contains("hidden"), null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector("#remoteMatchSelect")?.options.length > 0);
  if (await page.locator("#pushBtn,#undoBtn,#blankBtn,#sceneList").count()) {
    throw new Error("手机录入页仍显示直播操作");
  }
  const actionStatus = await page.evaluate(async () => (await fetch("/api/remote/action", {
    method:"POST",
    headers:{"Content-Type":"application/json","X-PKC-CSRF":sessionStorage.getItem("pkcRemoteCsrf")},
    body:JSON.stringify({action:"push"}),
  })).status);
  if (actionStatus !== 410) throw new Error("手机直播推送接口仍可使用");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  if (!await page.locator("#remoteOcrBtn").isDisabled()) throw new Error("断网时应禁用截图上传");
  console.log("手机配对与专用录入页面检查通过");
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
