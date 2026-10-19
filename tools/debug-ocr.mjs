import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const img = process.argv[2];
const b64 = fs.readFileSync(img).toString("base64");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:8971/", { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(async (b64) => {
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/assets/tesseract/tesseract.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  const w = await window.Tesseract.createWorker("chi_sim+eng", 1, {
    workerPath: "/assets/tesseract/worker.min.js",
    corePath: "/assets/tesseract/",
    langPath: "/assets/tesseract/lang",
    gzip: true
  });
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], "shot.jpg", { type: "image/jpeg" });
  // 与网页里一致：先放大再识别
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 900 ? 3 : (bmp.width < 1600 ? 2 : 1.5);
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width*scale); cv.height = Math.round(bmp.height*scale);
  const cx2 = cv.getContext("2d");
  cx2.imageSmoothingQuality = "high";
  cx2.drawImage(bmp, 0, 0, cv.width, cv.height);
  const res = await w.recognize(cv, {}, { text: true, tsv: true });
  const d = res.data;
  const page = window.PKC.pageSizeFromTSV(d.tsv);
  const words = window.PKC.wordsFromTSV(d.tsv);
  const lanes = window.PKC.splitLanes(words, page.w);
  const rowsAll = window.PKC.clusterRows(words);
  const dbg = { page, words: words.length, laneSplit: lanes ? lanes.cut : null,
    leftN: lanes ? window.PKC.clusterRows(lanes.left).length : null,
    rightN: lanes ? window.PKC.clusterRows(lanes.right).length : null,
    rowsAll: rowsAll.length,
    sampleRows: rowsAll.slice(0, 6).map(r => r.words.map(x => x.text).join("|")) };
  if (lanes){
    dbg.leftRows = window.PKC.clusterRows(lanes.left).map(r => r.words.map(x=>x.text).join("|"));
    dbg.rightRows = window.PKC.clusterRows(lanes.right).map(r => r.words.map(x=>x.text).join("|"));
  }
  dbg.text = (d.text||"").slice(0, 400);
  // 第一个选手行的词与置信度
  const rowsAll2 = window.PKC.clusterRows(wordsFromTSV(d.tsv));
  const firstPlayer = rowsAll2.find(r => r.words.map(w => w.text).join("").match(/\d\/\d\/\d/) || r.words.map(w=>w.text).join("").match(/\d+\/\d+/) );
  dbg.firstPlayer = firstPlayer ? firstPlayer.words.map(w => [w.text, Math.round(w.cx), Math.round(w.conf||0)].join("|")) : null;
  function wordsFromTSV(t){ return window.PKC.wordsFromTSV(t); }
  // x 占用直方图（粗）
  const B = 40, nb = Math.ceil(page.w/B), occ = new Array(nb).fill(0);
  words.forEach(x => { const a = Math.floor(x.x/B), b = Math.floor((x.x+x.w)/B); for (let i=a;i<=b;i++) occ[i]++; });
  dbg.occ = occ.join(",");
  return dbg;
}, b64);

await browser.close();
console.log(JSON.stringify(out, null, 2));
