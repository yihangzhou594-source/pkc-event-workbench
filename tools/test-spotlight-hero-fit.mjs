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
const port = 20400 + Math.floor(Math.random() * 300);
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
  await page.route("**/api/tencent-heroes", (route) => route.fulfill({
    status:200,
    contentType:"application/json",
    body:JSON.stringify({ heroes:[{ id:"901", name:"测试英雄" }] }),
  }));
  await page.route("**/tencent-hero/901", (route) => route.fulfill({
    status:200,
    contentType:"image/svg+xml",
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#9b7449"/><circle cx="200" cy="250" r="150" fill="#f4dfb5"/></svg>',
  }));
  await page.addInitScript(() => {
    window.__spotlightRects = [];
    window.__spotlightImages = [];
    const rr = CanvasRenderingContext2D.prototype.roundRect;
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      window.__spotlightRects.push([x, y, w, h, r]);
      return rr.call(this, x, y, w, h, r);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, x, y, w, h) {
      window.__spotlightImages.push({ x, y, w, h, sourceW:image.width, sourceH:image.height });
      return drawImage.apply(this, arguments);
    };
  });
  await page.goto(`http://127.0.0.1:${port}/promo`, { waitUntil:"load" });
  await page.waitForFunction(() => window.PKCSpotlight);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.id = "fitPreview";
    document.body.append(canvas);
    await window.PKCSpotlight.draw(canvas, {
      index:0,
      teams:{ blue:{ name:"蓝队" }, red:{ name:"红队" } },
      items:[{ lane:"上单", blue:{ player:"甲", heroName:"测试英雄" }, red:{ player:"乙", heroName:"测试英雄" } }],
    });
  });
  const result = await page.evaluate(() => ({
    rects:window.__spotlightRects.filter(([x, y, w, h]) => w >= 600 && h >= 200),
    images:window.__spotlightImages.filter((item) => item.sourceW === 400 && item.sourceH === 800 && item.w && item.h),
  }));
  const imageBox = result.rects.find((rect) => rect[2] >= 620 && rect[2] <= 660 && rect[3] >= 450);
  if (!imageBox || imageBox[3] < 480) throw new Error("英雄图窗口没有拉长到目标高度");
  const contained = result.images.some((item) =>
    item.w <= imageBox[2] + .5 && item.h <= imageBox[3] + .5
    && Math.abs((item.w / item.h) - .5) < .02);
  if (!contained) throw new Error("英雄立绘没有完整等比显示");
  const screenshot = path.join(os.tmpdir(), "pkc-spotlight-hero-fit.png");
  await page.locator("#fitPreview").screenshot({ path:screenshot });
  console.log(JSON.stringify({ imageBox, contained, draws:result.images.length }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
