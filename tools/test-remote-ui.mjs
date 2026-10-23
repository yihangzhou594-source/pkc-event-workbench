import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const port = 18000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  env: { ...process.env, PKC_PORT: String(port), PKC_REMOTE: "1", PKC_OPEN: "0" },
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
  await page.waitForFunction(() => document.querySelectorAll("#sceneList .scene").length >= 5, null, { timeout: 10000 });

  const session = await page.evaluate(async () => {
    const bad = await fetch("/api/remote/action", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ action:"select-scene", scene:"interval" }),
    });
    return { badStatus:bad.status };
  });
  if (session.badStatus !== 403) throw new Error("远程动作未校验 CSRF");

  await page.getByRole("button", { name:/赛间/ }).click();
  await page.waitForFunction(() => document.querySelector("#preview")?.textContent === "赛间");
  await page.click("#pushBtn");
  await page.waitForFunction(() => document.querySelector("#onAir")?.textContent === "赛间", null, { timeout:10000 });
  if (await page.locator("#undoBtn").isDisabled()) throw new Error("推送后撤回应可用");
  await page.click("#undoBtn");
  await page.waitForFunction(() => document.querySelector("#onAir")?.textContent === "空白", null, { timeout:10000 });

  await page.getByRole("button", { name:/赛后数据图/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#pushBtn");
  await page.waitForFunction(() => document.querySelector("#onAir")?.textContent === "赛后数据图", null, { timeout:10000 });

  await page.locator("#blankBtn").hover();
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#onAir")?.textContent === "空白", null, { timeout:10000 });
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  if (!await page.locator("#pushBtn").isDisabled()) throw new Error("断网时推送按钮应禁用");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  console.log(JSON.stringify({ access, remoteUi: true }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
