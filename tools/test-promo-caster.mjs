import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 20100 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd:root,
  env:{ ...process.env, PKC_PORT:String(port), PKC_OPEN:"0" },
  stdio:"ignore",
  windowsHide:true,
});

let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel:"msedge", headless:true });
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
    window.__promoFonts = [];
    Object.defineProperty(CanvasRenderingContext2D.prototype, "font", {
      configurable:descriptor.configurable,
      enumerable:descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(value) {
        window.__promoFonts.push(String(value));
        descriptor.set.call(this, value);
      },
    });
  });
  await page.goto(`http://127.0.0.1:${port}/promo`, { waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#pMsg")?.textContent.includes("vs"));
  await page.waitForTimeout(500);
  const before = await page.locator("#poster").evaluate((canvas) => canvas.toDataURL("image/png"));
  if (await page.locator("#pCaster1").count() !== 1
    || await page.locator("#pCaster2").count() !== 1
    || await page.locator("#pCaster3").count() !== 1) {
    throw new Error("赛前宣传图缺少 1—3 位解说输入框");
  }
  await page.fill("#pCaster1", "小蓝");
  await page.fill("#pCaster2", "阿策");
  await page.fill("#pCaster3", "解说三");
  if (await page.locator("#pSubHeroLeft").count() !== 1
    || await page.locator("#pSubHeroRight").count() !== 1) {
    throw new Error("替补选手缺少代表英雄输入框");
  }
  await page.waitForTimeout(500);
  const after = await page.locator("#poster").evaluate((canvas) => canvas.toDataURL("image/png"));
  if (before === after) throw new Error("填写解说名后宣传图没有重新渲染");
  await page.evaluate(() => {
    document.querySelector("#pSubOptionsLeft").open = true;
    document.querySelector("#pSubOptionsRight").open = true;
  });
  await page.fill("#pSubLeft", "替补甲");
  await page.fill("#pSubHeroLeft", "张飞");
  await page.fill("#pSubRight", "替补乙");
  await page.fill("#pSubHeroRight", "庄周");
  await page.waitForTimeout(500);
  const withSubstitutes = await page.locator("#poster").evaluate((canvas) => canvas.toDataURL("image/png"));
  if (withSubstitutes === after) throw new Error("填写替补与代表英雄后宣传图没有重绘");
  const usedFonts = await page.evaluate(() => window.__promoFonts || []);
  if (!usedFonts.some((value) => value.includes("Noto Sans SC"))) {
    throw new Error("宣传图没有使用设计字体 Noto Sans SC");
  }
  if (!usedFonts.some((value) => value.includes("Bahnschrift SemiCondensed"))) {
    throw new Error("宣传图没有使用数字字体 Bahnschrift SemiCondensed");
  }
  const screenshot = path.join(os.tmpdir(), "pkc-promo-casters.png");
  await page.locator("#poster").screenshot({ path:screenshot });
  await page.fill("#pCaster1", "超长解说姓名用于验证自动缩放不会覆盖其他内容");
  await page.waitForTimeout(300);
  const longName = await page.locator("#poster").evaluate((canvas) => canvas.toDataURL("image/png"));
  if (longName === after) throw new Error("长解说名未更新渲染");
  console.log(JSON.stringify({ casterInputs:3, rendered:true, screenshot }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
