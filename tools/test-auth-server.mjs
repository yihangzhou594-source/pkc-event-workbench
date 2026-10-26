import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLOUD_STORE_KEYS } from "../lib/data-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-auth-server-"));
const fakePort = 23100 + Math.floor(Math.random() * 200);
const serverPort = 23400 + Math.floor(Math.random() * 200);
let child = null;

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

const fakeSupabase = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${fakePort}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};

  if (url.pathname === "/rest/v1/pkc_records") {
    return sendJson(res, 200, CLOUD_STORE_KEYS.map((key) => ({
      key,
      data: key === "library" ? { series: [] } : key === "matches" ? { games: {} } : {},
      revision: 1,
      updated_at: "2026-10-26T00:00:00Z",
    })));
  }
  if (url.pathname === "/rest/v1/pkc_audit" && req.method === "POST") {
    return sendJson(res, 201, []);
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    if (body.email === "staff@example.com" && body.password === "secret-123") {
      return sendJson(res, 200, {
        access_token: "good-token",
        refresh_token: "good-refresh",
        expires_in: 3600,
        user: { id: "staff-1", email: "staff@example.com" },
      });
    }
    return sendJson(res, 400, { error_description: "Invalid login credentials" });
  }
  if (url.pathname === "/auth/v1/user") {
    if (req.headers.authorization === "Bearer good-token") {
      return sendJson(res, 200, { id: "staff-1", email: "staff@example.com" });
    }
    return sendJson(res, 401, { message: "invalid JWT" });
  }
  if (url.pathname === "/auth/v1/logout") {
    res.writeHead(204);
    return res.end();
  }
  return sendJson(res, 404, { message: "not found" });
});

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/healthz`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("cloud auth test server failed to start");
}

try {
  await new Promise((resolve, reject) => {
    fakeSupabase.once("error", reject);
    fakeSupabase.listen(fakePort, "127.0.0.1", resolve);
  });

  child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PKC_CLOUD: "1",
      PKC_REMOTE: "1",
      PKC_PORT: String(serverPort),
      PKC_DATA_DIR: temp,
      PKC_ALLOWED_EMAILS: "staff@example.com",
      SUPABASE_URL: `http://127.0.0.1:${fakePort}`,
      SUPABASE_ANON_KEY: "anon-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    },
  });

  const health = await waitForServer();
  assert.equal(health.cloud, true);
  assert.equal(health.auth, true);

  const page = await fetch(`http://127.0.0.1:${serverPort}/`, {
    redirect: "manual",
  });
  assert.equal(page.status, 303);
  assert.match(page.headers.get("location") || "", /^\/login\?next=/);

  const denied = await fetch(`http://127.0.0.1:${serverPort}/api/store/library`);
  assert.equal(denied.status, 401);

  const login = await fetch(`http://127.0.0.1:${serverPort}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "staff@example.com", password: "secret-123" }),
  });
  assert.equal(login.status, 200);
  const cookies = typeof login.headers.getSetCookie === "function"
    ? login.headers.getSetCookie()
    : [login.headers.get("set-cookie") || ""];
  const cookieHeader = cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
  assert.match(cookieHeader, /pkc_auth_access=good-token/);

  const allowed = await fetch(`http://127.0.0.1:${serverPort}/api/store/library`, {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { series: [] });

  console.log("test-auth-server: ok");
} finally {
  if (child?.pid) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  fakeSupabase.closeAllConnections?.();
  await new Promise((resolve) => fakeSupabase.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
