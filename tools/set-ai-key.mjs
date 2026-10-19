import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "数据", "ai-config.json");
const HELPER = path.join(ROOT, "tools", "ai-secret.ps1");
const key = process.env.DEEPSEEK_API_KEY || "";
if (!key) {
  console.error("请先设置环境变量 DEEPSEEK_API_KEY，再运行本脚本。");
  process.exit(1);
}
let p = null;
for (const exe of ["pwsh", "powershell"]) {
  p = spawnSync(exe, [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", HELPER, "protect",
  ], { input: key, encoding: "utf8" });
  if (p.status === 0 && p.stdout && p.stdout.trim()) break;
}
if (p.status !== 0 || !p.stdout.trim()) {
  console.error("加密失败：" + (p.stderr || "未知错误"));
  process.exit(1);
}
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {}
cfg.baseUrl = cfg.baseUrl || "https://api.deepseek.com";
cfg.model = cfg.model || "deepseek-flash";
cfg.maxTokens = cfg.maxTokens || 8000;
cfg.apiKeyEnc = p.stdout.trim();
delete cfg.apiKey;
fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");
console.log("已写入加密 Key：" + CONFIG);
