import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { seedContextFixture, startTestServer } from "./browser-test-fixture.mjs";

const data = await fs.mkdtemp(path.join(os.tmpdir(), "pkc-readiness-api-"));
let server;
try {
  await seedContextFixture(data);
  server = await startTestServer(data);
  const baseUrl = server.url;
  const readiness = await fetch(baseUrl + "/api/director/readiness");
  if (!readiness.ok) {
    throw new Error(`预检接口返回 ${readiness.status}：${await readiness.text()}`);
  }
  const body = await readiness.json();
  if (!Array.isArray(body.scenes) || body.scenes.length !== 7) {
    throw new Error("预检接口没有返回七个场景");
  }
  async function directorAction(action, payload) {
    const response = await fetch(baseUrl + "/api/director/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, state: await response.json() };
  }
  const commentaryReady = body.scenes.find((scene) => scene.id === "commentary").status !== "blocked";
  for (const source of body.scenes.filter((scene) => scene.id !== "commentary")) {
    assert.equal((await directorAction("scene", { id: source.id })).status, 200);
    const push = await directorAction("push", { force:true });
    if (source.id === "chart") {
      assert.equal(push.status, 409);
      assert.equal(push.state.error, "chart_not_prepared");
      continue;
    }
    assert.equal(push.status, 200);
    assert.equal(push.state.onAir.scene, source.id);
    assert.equal((await directorAction("scene", { id: "commentary" })).status, 200);
    const result = await directorAction("push", {});
    assert.equal(result.status, commentaryReady ? 200 : 409, source.id);
    if (!commentaryReady) assert.equal(result.state.error, "readiness_blocked", source.id);
    const pushed = commentaryReady ? result : await directorAction("push", { force: true });
    assert.equal(pushed.state.onAir.scene, "commentary", source.id);
  }
  const pingAgain = await fetch(baseUrl + "/api/ping");
  if (!pingAgain.ok) throw new Error("预检请求后服务不再可用");
  console.log(JSON.stringify({ ok: true, scenes: body.scenes.length }));
} finally {
  await server?.stop();
  await fs.rm(data, { recursive:true, force:true });
}
