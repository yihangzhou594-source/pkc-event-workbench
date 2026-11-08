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
assert.ok(source.includes("prepare-local-server.mjs"), "启动脚本应安全探测并接管旧 PKC 服务");

function launchMode(arg, port) {
  const child = spawn("cmd.exe", ["/d", "/c", "启动.bat", arg], {
    cwd: root,
    env: { ...process.env, PKC_PORT: String(port), PKC_OPEN: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", d => { child.output += d; });
  return child;
}

async function waitForMode(port, remoteExpected) {
  for (let i = 0; i < 200; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/remote/access`, { signal: AbortSignal.timeout(1000), headers: { Connection: "close" } });
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
  if (!child?.pid) return;
  child.stdout?.destroy(); child.stderr?.destroy();
  try { child.kill(); } catch {}
  // The direct kill closes the parent handle in restricted environments where
  // taskkill can be denied; taskkill still cleans up the child process tree
  // when the OS permits it.
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
}

async function stopServer(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/api/ping`, {signal:AbortSignal.timeout(1000)}); const info=await r.json(); if (info.root === root && Number.isInteger(info.pid)) process.kill(info.pid); } catch {}
}
async function runMode(arg, remoteExpected) {
  const port = (arg === "remote" ? 21100 : 21300) + Math.floor(Math.random() * 300);
  const child = launchMode(arg, port);
  try {
    let info;
    try { info = await waitForMode(port, remoteExpected); } catch (e) { throw new Error(e.message + "\n" + child.output); }
    assert.equal(info.port, port);
  } finally {
    await stopServer(port);
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
  let info;
  try { info = await waitForMode(takeoverPort, true); } catch(e) { throw new Error(e.message + "\n" + second.output); }
  assert.equal(info.enabled, true);
  assert.equal(info.host, "0.0.0.0");
} finally {
  await stopServer(takeoverPort);
  killTree(first);
  killTree(second);
}
console.log("test-start-script: ok");
