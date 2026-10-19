import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const NM = process.env.PKC_NM ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { createWorker } = require(path.join(NM, "tesseract.js"));
const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const img = process.argv[2];
if (!img) process.exit(1);
const worker = await createWorker("chi_sim+eng", 1, {
  langPath: path.join(ROOT, "assets/tesseract/lang"),
  gzip: true,
  cachePath: path.join(ROOT, "assets/tesseract/cache"),
  logger: () => {},
});
for (const psm of ["7", "8", "10", "13"]) {
  const r = await worker.recognize(img, { tessedit_pageseg_mode: psm });
  console.log(psm + ": " + JSON.stringify((r.data.text || "").trim()));
}
await worker.terminate();
