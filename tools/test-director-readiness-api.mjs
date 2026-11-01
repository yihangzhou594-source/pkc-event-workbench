import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function waitForPing(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl + "/api/ping");
      if (response.ok) return;
    } catch {
      // The server may still be scanning hero assets.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("测试服务未能启动");
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let stderr = "";
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await waitForPing(baseUrl);
  const readiness = await fetch(baseUrl + "/api/director/readiness");
  if (!readiness.ok) {
    throw new Error(`预检接口返回 ${readiness.status}：${await readiness.text()}`);
  }
  const body = await readiness.json();
  if (!Array.isArray(body.scenes) || body.scenes.length !== 6) {
    throw new Error("预检接口没有返回六个场景");
  }
  const pingAgain = await fetch(baseUrl + "/api/ping");
  if (!pingAgain.ok) throw new Error("预检请求后服务不再可用");
  console.log(JSON.stringify({ ok: true, port, scenes: body.scenes.length }));
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  child.kill();
}
