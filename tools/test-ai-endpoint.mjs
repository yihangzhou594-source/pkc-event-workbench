import fs from "node:fs";

const [gear, stats] = process.argv.slice(2);
if (!gear || !stats) process.exit(1);
const dataUrl = f => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const r = await fetch("http://127.0.0.1:8971/api/ai-ocr", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ images: [dataUrl(gear), dataUrl(stats)] }),
});
const out = await r.json();
console.log(JSON.stringify({ status: r.status, ok: out.ok, error: out.error || null,
  usage: out.usage || null, data: out.data || null }, null, 2));
