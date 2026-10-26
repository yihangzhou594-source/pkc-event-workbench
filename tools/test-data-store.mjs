import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDataGateway, CLOUD_STORE_KEYS } from "../lib/data-store.mjs";

const tempRoots = [];

function tempDataDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-cloud-store-"));
  tempRoots.push(root);
  const dataDir = path.join(root, "数据");
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, dataDir };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

try {
  {
    const { root, dataDir } = tempDataDir();
    fs.writeFileSync(path.join(dataDir, "prefs.json"), JSON.stringify({ theme: "dark" }));
    const gateway = createDataGateway({ root, dataDir, cloud: false, refresh: false });
    await gateway.initialize();
    assert.equal(gateway.hasCloudDataStore(), false);
    assert.deepEqual(gateway.readData("prefs"), { theme: "dark" });

    const first = await gateway.writeData("prefs", { theme: "light" });
    assert.equal(first.ok, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "prefs.json"), "utf8")), {
      theme: "light",
    });
    assert.ok(gateway.revisionOf("prefs"));
    gateway.stop();
  }

  {
    const { root, dataDir } = tempDataDir();
    fs.writeFileSync(path.join(dataDir, "library.json"), JSON.stringify({ series: [] }));
    for (const key of CLOUD_STORE_KEYS) {
      if (key === "library") continue;
      fs.writeFileSync(path.join(dataDir, key + ".json"), JSON.stringify({ seeded: key }));
    }
    const calls = [];
    const rows = [
      {
        key: "library",
        data: { series: [{ id: "cloud-series" }] },
        revision: 4,
        updated_at: "2026-10-26T00:00:00.000Z",
      },
    ];
    const remote = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.startsWith("/rest/v1/pkc_records?select=")) {
        return jsonResponse(rows);
      }
      if (url === "/rest/v1/pkc_records?on_conflict=key") {
        const payload = JSON.parse(init.body);
        return jsonResponse(payload);
      }
      if (url === "/rest/v1/rpc/pkc_write_record") {
        const body = JSON.parse(init.body);
        return jsonResponse({ key: body.p_key, revision: 5, updatedAt: "2026-10-26T00:01:00.000Z" });
      }
      throw new Error("unexpected request: " + url);
    };

    const gateway = createDataGateway({
      root,
      dataDir,
      cloud: true,
      fetchImpl: remote,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-test",
      refresh: false,
    });
    await gateway.initialize();

    assert.equal(gateway.hasCloudDataStore(), true);
    assert.deepEqual(gateway.readData("library"), { series: [{ id: "cloud-series" }] });
    assert.equal(gateway.revisionOf("library"), "4");
    assert.ok(calls[0].init.headers.Authorization.includes("service-role-test"));

    const result = await gateway.writeData(
      "library",
      { series: [{ id: "updated" }] },
      { baseRevision: "4", actor: "staff@example.com" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.revision, "5");
    assert.equal(gateway.revisionOf("library"), "5");
    assert.deepEqual(gateway.readData("library"), { series: [{ id: "updated" }] });

    const writeCall = calls.find((call) => call.url === "/rest/v1/rpc/pkc_write_record");
    assert.deepEqual(JSON.parse(writeCall.init.body), {
      p_key: "library",
      p_data: { series: [{ id: "updated" }] },
      p_expected_revision: 4,
      p_actor: "staff@example.com",
    });

    const seeded = calls.filter((call) => call.url.includes("on_conflict=key"));
    assert.equal(seeded.length, CLOUD_STORE_KEYS.length - 1);
    gateway.stop();
  }

  {
    const { root, dataDir } = tempDataDir();
    const calls = [];
    const remote = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.startsWith("/rest/v1/pkc_records?select=")) return jsonResponse([]);
      if (url === "/rest/v1/pkc_records?on_conflict=key") return jsonResponse([]);
      throw new Error("unexpected request: " + url);
    };
    const gateway = createDataGateway({
      root,
      dataDir,
      cloud: true,
      fetchImpl: remote,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "sb_secret_test_server_key",
      refresh: false,
    });
    await gateway.initialize();
    assert.equal(calls[0].init.headers.apikey, "sb_secret_test_server_key");
    assert.equal(calls[0].init.headers.Authorization, undefined);
    gateway.stop();
  }

  {
    const { root, dataDir } = tempDataDir();
    const remote = async (url) => {
      if (url.startsWith("/rest/v1/pkc_records?select=")) {
        return jsonResponse([{ key: "library", data: {}, revision: 2, updated_at: "2026-10-26T00:00:00Z" }]);
      }
      if (url === "/rest/v1/rpc/pkc_write_record") {
        return jsonResponse({ message: "pkc_revision_conflict" }, 400);
      }
      throw new Error("unexpected request: " + url);
    };
    const gateway = createDataGateway({
      root,
      dataDir,
      cloud: true,
      fetchImpl: remote,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-test",
      refresh: false,
    });
    await gateway.initialize();
    const result = await gateway.writeData("library", { changed: true }, { baseRevision: "1" });
    assert.deepEqual(result, {
      ok: false,
      conflict: true,
      key: "library",
      revision: "2",
      error: "pkc_revision_conflict",
    });
    gateway.stop();
  }

  {
    const { root, dataDir } = tempDataDir();
    const requests = [];
    const remote = async (url, init = {}) => {
      requests.push({ url, init });
      if (url.startsWith("/rest/v1/pkc_records?select=")) return jsonResponse([]);
      if (url === "/rest/v1/pkc_records?on_conflict=key") {
        return jsonResponse(JSON.parse(init.body));
      }
      if (url.startsWith("/rest/v1/pkc_backups?key=eq.")) {
        return jsonResponse([
          {
            id: 17,
            key: "prefs",
            revision: 2,
            created_at: "2026-10-26T00:00:00Z",
            data: { theme: "dark" },
          },
        ]);
      }
      if (url === "/rest/v1/pkc_audit?select=*") {
        return jsonResponse([
          { id: 9, action: "write", record_key: "prefs", detail: "revision 2", created_at: "2026-10-26T00:00:00Z" },
        ]);
      }
      if (url.startsWith("/rest/v1/pkc_audit") && init.method === "POST") {
        return jsonResponse([], 201);
      }
      throw new Error("unexpected request: " + url);
    };
    fs.writeFileSync(path.join(dataDir, "prefs.json"), JSON.stringify({ theme: "light" }));
    const gateway = createDataGateway({
      root,
      dataDir,
      cloud: true,
      fetchImpl: remote,
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-test",
      refresh: false,
    });
    await gateway.initialize();
    const backups = await gateway.listBackups("prefs");
    assert.equal(backups[0].name, "17");
    const audit = await gateway.readAudit(20);
    assert.equal(audit[0].action, "write");
    await gateway.appendAudit("restore", "backup 17", "prefs", "staff@example.com");
    assert.ok(requests.some((request) => request.url.startsWith("/rest/v1/pkc_audit") && request.init.method === "POST"));
    gateway.stop();
  }

  console.log("test-data-store: ok");
} finally {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
}
