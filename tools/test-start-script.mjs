import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith(".bat"));
assert.deepEqual(scripts, ["启动.bat"], "根目录应只保留一个启动脚本");
const source = fs.readFileSync(path.join(root, "启动.bat"), "utf8");
assert.ok(/local/i.test(source) && /remote/i.test(source), "启动脚本应支持普通与远程两种模式");
assert.ok(source.includes("PKC_REMOTE"), "启动脚本应设置远程模式环境变量");
assert.ok(source.includes("Get-NetTCPConnection"), "启动脚本应检查端口上的现有服务");
assert.ok(source.includes("Stop-Process"), "启动脚本应关闭旧 PKC 服务后再启动");

function launchMode(arg, port) {
  return spawn("cmd.exe", ["/d", "/c", "启动.bat", arg], {
    cwd: root,
    env: { ...process.env, PKC_PORT: String(port), PKC_OPEN: "0" },
    stdio: "ignore",
    windowsHide: true,
  });
}

async function waitForMode(port, remoteExpected) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/remote/access`);
      if (response.ok) {
        const info = await response.json();
        if (info.enabled === remoteExpected) return info;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${remoteExpected ? "远程" : "本机"} 模式服务未启动`);
}

function killTree(child) {
  if (child?.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
}

async function runMode(arg, remoteExpected) {
  const port = (arg === "remote" ? 21100 : 21300) + Math.floor(Math.random() * 300);
  const child = launchMode(arg, port);
  try {
    const info = await waitForMode(port, remoteExpected);
    assert.equal(info.port, port);
  } finally {
    killTree(child);
  }
}

await runMode("local", false);
await runMode("remote", true);

const takeoverPort = 21700 + Math.floor(Math.random() * 200);
const first = launchMode("local", takeoverPort);
let second = null;
try {
  await waitForMode(takeoverPort, false);
  second = launchMode("remote", takeoverPort);
  const info = await waitForMode(takeoverPort, true);
  assert.equal(info.enabled, true);
  assert.equal(info.host, "0.0.0.0");
} finally {
  killTree(first);
  killTree(second);
}
console.log("test-start-script: ok");
