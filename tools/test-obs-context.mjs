import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { contextFixture as ctx, launchBrowser, seedContextFixture, startTestServer } from "./browser-test-fixture.mjs";

// Browser (playwright) smoke test with private data and a system-assigned port.
const data = await fs.mkdtemp(path.join(os.tmpdir(), "pkc-context-smoke-"));
let server;
let browser;
try {
  await seedContextFixture(data);
  server = await startTestServer(data);
  const API = server.url;
  async function post(path, body) {
    const response = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} 失败：${await response.text()}`);
  }
  await post("/api/director/context", ctx);
  await post("/api/director/scene", { id: "bracket" });
  await post("/api/director/push");

  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(API + "/obs/bracket", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => ({
    active: !!document.querySelector(".bk-active"),
    activeKey: document.querySelector(".bk-active")?.dataset.key || "",
  }));
  console.log(JSON.stringify(out, null, 2));
  if (!out.active || out.activeKey !== "R16-1") throw new Error("赛程图未高亮当前场次");
} finally {
  try { await browser?.close(); }
  finally {
    await server?.stop();
    await fs.rm(data, { recursive:true, force:true });
  }
}
