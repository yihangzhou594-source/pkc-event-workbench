/**
 * 本地 OCR 冒烟测试：确认 tesseract + 中文语言包可用。
 * 用法： node tools/ocr-test.mjs <图片路径>
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const NM = process.env.PKC_NM || "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { createWorker } = require(path.join(NM, "tesseract.js"));

const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const img = process.argv[2];
if (!img || !fs.existsSync(img)) { console.error("用法: node tools/ocr-test.mjs <图片>"); process.exit(1); }

const t0 = Date.now();
const worker = await createWorker("chi_sim+eng", 1, {
  langPath: path.join(ROOT, "assets/tesseract/lang"),
  gzip: true,
  cachePath: path.join(ROOT, "assets/tesseract/cache"),
  logger: () => {}
});
const { data } = await worker.recognize(img);
await worker.terminate();

const txt = (data.text || "").replace(/\n{2,}/g, "\n").trim();
fs.writeFileSync(path.join(ROOT, "tools", "_ocr-out.txt"), txt, "utf8");
console.log("耗时 " + ((Date.now()-t0)/1000).toFixed(1) + "s，识别字符数 " + txt.length);
console.log("---------- 前 1500 字 ----------");
console.log(txt.slice(0, 1500));
