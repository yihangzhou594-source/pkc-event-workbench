import fs from "node:fs";

const [gear, stats] = process.argv.slice(2);
if (!gear || !stats) {
  console.error("usage: node tools/deepseek-ocr-test.mjs <gear.jpg> <stats.jpg>");
  process.exit(1);
}
const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error("DEEPSEEK_API_KEY is not set");
  process.exit(1);
}
const b64 = file => fs.readFileSync(file).toString("base64");
const prompt = [
  "你是王者荣耀赛后数据图表 OCR 引擎。",
  "第一张是装备页，第二张是数据页。",
  "只输出一个严格 JSON 对象，不要 Markdown，不要解释，不要代码块。",
  '结构必须是：{"blue":[{"name":"","hero":"","k":0,"d":0,"a":0,"gold":0,"dmgRaw":0,"tankRaw":0,"dmgPct":0,"tankPct":0,"goldShare":0,"kp":0}],"red":[...5个...],"duration":""}',
  "按图片从上到下五行读取；蓝方在左，红方在右。",
  "name 和 hero 必须按图片文字原样读取，不要把昵称和英雄名互换。",
  "百分比只输出数字，不带 %；不确定的字段用 null，不要编造。",
].join("\n");
const body = {
  model: "deepseek-flash",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "text", text: "第一张：装备页" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64(gear) } },
      { type: "text", text: "第二张：数据页" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64(stats) } },
    ],
  }],
  max_tokens: 8000,
  temperature: 0,
  response_format: { type: "json_object" },
};
const res = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log("status", res.status);
console.log(text);
