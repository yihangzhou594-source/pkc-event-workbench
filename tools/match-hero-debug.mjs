import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const img = process.argv[2];
const b64 = fs.readFileSync(img).toString("base64");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const url = "http://localhost:8971/generator";
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });
const out = await page.evaluate(async (b64) => {
  await window.PKC.loadIconFeatures();
  const im = new Image();
  im.src = "data:image/jpeg;base64," + b64;
  await new Promise((res, rej) => { im.onload = res; im.onerror = rej; });
  const c = document.createElement("canvas");
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  c.getContext("2d").drawImage(im, 0, 0);
  const boxes = [
    { name:"blue1", x:190, y:245, w:250, h:250 },
    { name:"blue4", x:190, y:870, w:250, h:250 },
    { name:"red1", x:1480, y:245, w:250, h:250 },
  ];
  return boxes.map(b => ({ box:b, ...window.PKC.matchHeroIcon(c, b) }));
}, b64);
await browser.close();
console.log(JSON.stringify(out, null, 2));


