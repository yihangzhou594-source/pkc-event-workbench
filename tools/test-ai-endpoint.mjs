import fs from "node:fs";
import path from "node:path";

const [gear, stats] = process.argv.slice(2);
if (!gear || !stats) process.exit(1);
const mime = f => ({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}[path.extname(f).toLowerCase()] || "application/octet-stream");
const dataUrl = f => "data:" + mime(f) + ";base64," + fs.readFileSync(f).toString("base64");
const port = process.env.PKC_TEST_PORT || "8971";
const r = await fetch("http://127.0.0.1:" + port + "/api/ai-ocr", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ images: [dataUrl(gear), dataUrl(stats)] }),
});
const out = await r.json();
console.log(JSON.stringify({ status: r.status, ok: out.ok, error: out.error || null,
  usage: out.usage || null, data: out.data || null }, null, 2));
