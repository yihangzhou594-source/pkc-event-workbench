/**
 * 一键跑回归。
 *
 *   node tools/test-all.mjs           # 全部（浏览器测试需要本机 Edge）
 *   node tools/test-all.mjs --fast    # 只跑不需要浏览器的
 *   node tools/test-all.mjs --browser # 只跑浏览器回归
 *
 * 自动根据脚本里有没有 playwright 来分组，新增 test-*.mjs 会被自动收录。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, "tools");
const args = new Set(process.argv.slice(2));
const onlyFast = args.has("--fast");
const onlyBrowser = args.has("--browser");

const fast = [
  "bp-core/test/store.test.js",
  "bp-core/test/series.test.js",
  "bp-core/test/machine.test.js",
  "bp-core/test/sequence.test.js",
  "tools/check-console.mjs",
];
const browser = [];

for (const name of fs.readdirSync(TOOLS)) {
  if (!/^test-.*\.mjs$/.test(name)) continue;
  if (name === "test-all.mjs") continue;
  if (name.startsWith("test-ai")) continue;          // 需要外网 / API Key，单独跑
  const src = fs.readFileSync(path.join(TOOLS, name), "utf8");
  const item = "tools/" + name;
  if (src.includes("playwright")) browser.push(item);
  else if (!fast.includes(item)) fast.push(item);
}

const queue = onlyFast ? fast : onlyBrowser ? browser : [...fast, ...browser];
if (!queue.length) {
  console.log("没有匹配的测试。");
  process.exit(0);
}

console.log(`PKC 回归 · ${queue.length} 个脚本\n`);
const failed = [];
const started = Date.now();

for (const item of queue) {
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [item], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, PKC_TEST_ALL: "1" },
  });
  const ms = Date.now() - t0;
  if (res.status === 0) {
    console.log(`  ✔ ${item}  (${ms}ms)`);
    continue;
  }
  const text = `${res.stdout || ""}\n${res.stderr || ""}`.trim();
  const lines = text.split("\n").filter(Boolean);
  const tail = lines.slice(-8).join("\n");
  console.log(`  ✘ ${item}  (${ms}ms)`);
  if (tail) console.log(tail.split("\n").map((l) => "      " + l).join("\n"));
  failed.push(item);
}

console.log(`\n完成：${queue.length - failed.length} 通过，${failed.length} 失败，用时 ${Math.round((Date.now() - started) / 1000)}s`);
if (failed.length) {
  console.log("失败：" + failed.join("、"));
  process.exit(1);
}
