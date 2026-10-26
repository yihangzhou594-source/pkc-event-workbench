/**
 * Event data gateway.
 *
 * Reads are synchronous because the rest of the existing application is
 * synchronous. Cloud mode loads a small in-memory read cache at startup and
 * performs writes through a transactional Supabase RPC. Local mode keeps the
 * existing atomic JSON-file behavior.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeJsonAtomic,
  listBackupVersions,
  restoreJsonBackup,
  snapshotJsonFile,
} from "./json-store.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const CLOUD_STORE_KEYS = [
  "library",
  "matches",
  "prefs",
  "heroPick",
  "bracket",
  "context",
  "heroStats",
];

let sharedGateway = null;

export function getSharedDataStore() {
  if (!sharedGateway) sharedGateway = createDataGateway();
  return sharedGateway;
}

export function setSharedDataStore(gateway) {
  sharedGateway = gateway;
}

function readJsonFile(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function hashFile(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

function makeError(message, status = 500, body = null) {
  const error = new Error(message);
  error.status = status;
  error.body = body;
  return error;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createDataGateway(options = {}) {
  const dataDir = options.dataDir
    ? path.resolve(options.dataDir)
    : process.env.PKC_DATA_DIR
      ? path.resolve(process.env.PKC_DATA_DIR)
      : path.join(ROOT, "数据");
  const backupDir = path.join(dataDir, "_backup");
  const cloud = options.cloud ?? (
    process.env.PKC_CLOUD === "1"
    && !!process.env.SUPABASE_URL
    && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const supabaseUrl = String(options.supabaseUrl ?? process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceRoleKey = String(
    options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const refreshMs = Math.max(1000, Number(options.refreshMs) || 30_000);
  const cache = new Map();
  let refreshTimer = null;
  let initialized = false;

  async function request(pathname, init = {}) {
    const url = fetchImpl === globalThis.fetch && /^\//.test(pathname)
      ? supabaseUrl + pathname
      : pathname;
    const response = await fetchImpl(url, init);
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
      const message = body && typeof body === "object"
        ? body.message || body.error || body.details || `Supabase HTTP ${response.status}`
        : String(body || `Supabase HTTP ${response.status}`);
      throw makeError(message, response.status, body);
    }
    return body;
  }

  function cloudHeaders(extra = {}) {
    const headers = {
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      ...extra,
    };
    // New Supabase secret keys (sb_secret_...) authenticate through apikey only.
    // Legacy service_role JWTs additionally require the Authorization header.
    if (!serviceRoleKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${serviceRoleKey}`;
    }
    return headers;
  }

  function localFile(key) {
    return path.join(dataDir, key + ".json");
  }

  function localRead(key, fallback = null) {
    return readJsonFile(localFile(key), fallback);
  }

  function updateCache(rows) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !CLOUD_STORE_KEYS.includes(row.key)) continue;
      const current = cache.get(row.key);
      const nextRevision = Number(row.revision) || 0;
      const currentRevision = Number(current?.revision) || -1;
      if (!current || nextRevision >= currentRevision) {
        cache.set(row.key, {
          data: row.data,
          revision: String(nextRevision),
          updatedAt: row.updated_at || "",
        });
      }
    }
  }

  async function loadRecords() {
    const rows = await request(
      "/rest/v1/pkc_records?select=key,data,revision,updated_at",
      { headers: cloudHeaders() },
    );
    updateCache(rows);
    return rows;
  }

  async function seedMissing(rows) {
    const present = new Set((rows || []).map((row) => row.key));
    for (const key of CLOUD_STORE_KEYS) {
      if (present.has(key)) continue;
      const data = localRead(key, null);
      if (data === null) continue;
      const payload = [{
        key,
        data,
        revision: 1,
        updated_at: new Date().toISOString(),
        updated_by: "bootstrap",
      }];
      const saved = await request(
        "/rest/v1/pkc_records?on_conflict=key",
        {
          method: "POST",
          headers: cloudHeaders({
            Prefer: "resolution=merge-duplicates,return=representation",
          }),
          body: JSON.stringify(payload),
        },
      );
      updateCache(saved);
    }
  }

  async function refresh() {
    if (!cloud) return;
    await loadRecords();
  }

  async function initialize() {
    if (initialized) return;
    fs.mkdirSync(dataDir, { recursive: true });
    if (cloud) {
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("云端模式缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
      }
      const rows = await loadRecords();
      await seedMissing(rows);
      if (options.refresh !== false) {
        refreshTimer = setInterval(() => {
          refresh().catch((error) => {
            console.error("云端数据同步失败：" + error.message);
          });
        }, refreshMs);
        refreshTimer.unref?.();
      }
    }
    initialized = true;
  }

  function readData(key, fallback = null) {
    if (cloud) return cache.get(key)?.data ?? fallback;
    return localRead(key, fallback);
  }

  function revisionOf(key) {
    if (cloud) return cache.get(key)?.revision || "";
    return hashFile(localFile(key));
  }

  async function writeData(key, data, writeOptions = {}) {
    if (!CLOUD_STORE_KEYS.includes(key)) {
      throw makeError("unknown key", 400);
    }
    const baseRevision = writeOptions.baseRevision;
    if (!cloud) {
      const current = revisionOf(key);
      if (baseRevision !== undefined && baseRevision !== null && baseRevision !== "" && current !== String(baseRevision)) {
        return { ok: false, conflict: true, key, revision: current, error: "pkc_revision_conflict" };
      }
      writeJsonAtomic(localFile(key), JSON.stringify(data, null, 2), {
        backupDir,
        key,
        forceBackup: !!writeOptions.forceBackup,
      });
      return { ok: true, key, revision: revisionOf(key) };
    }

    const expected = parseNumber(baseRevision);
    try {
      const result = await request("/rest/v1/rpc/pkc_write_record", {
        method: "POST",
        headers: cloudHeaders(),
        body: JSON.stringify({
          p_key: key,
          p_data: data,
          p_expected_revision: expected,
          p_actor: String(writeOptions.actor || ""),
        }),
      });
      const revision = String(result?.revision || "");
      cache.set(key, {
        data,
        revision,
        updatedAt: result?.updatedAt || new Date().toISOString(),
      });
      return { ok: true, key, revision, updatedAt: result?.updatedAt || "" };
    } catch (error) {
      const message = String(error.message || "");
      if (error.status === 409 || /revision_conflict|revision conflict/i.test(message)) {
        await refresh().catch(() => {});
        return {
          ok: false,
          conflict: true,
          key,
          revision: revisionOf(key),
          error: "pkc_revision_conflict",
        };
      }
      throw error;
    }
  }

  async function listBackups(key) {
    if (!cloud) return listBackupVersions(backupDir, key);
    const rows = await request(
      `/rest/v1/pkc_backups?key=eq.${encodeURIComponent(key)}&select=id,key,revision,created_at,data&order=created_at.desc&limit=100`,
      { headers: cloudHeaders() },
    );
    return (rows || []).map((row) => ({
      name: String(row.id),
      key: row.key,
      size: Buffer.byteLength(JSON.stringify(row.data)),
      mtime: Date.parse(row.created_at) || 0,
      revision: String(row.revision || ""),
    }));
  }

  async function restoreBackup(key, name) {
    if (!cloud) return restoreJsonBackup(localFile(key), backupDir, key, name);
    const id = Number(name);
    if (!Number.isFinite(id)) throw makeError("备份编号无效", 400);
    const rows = await request(
      `/rest/v1/pkc_backups?id=eq.${id}&select=id,key,data,revision,created_at`,
      { headers: cloudHeaders() },
    );
    const backup = Array.isArray(rows) ? rows[0] : null;
    if (!backup || backup.key !== key) throw makeError("找不到备份", 404);
    const result = await request("/rest/v1/rpc/pkc_restore_record", {
      method: "POST",
      headers: cloudHeaders(),
      body: JSON.stringify({ p_backup_id: id, p_actor: "" }),
    });
    cache.set(key, {
      data: backup.data,
      revision: String(result?.revision || ""),
      updatedAt: result?.updatedAt || new Date().toISOString(),
    });
    return {
      name: String(id),
      key,
      size: Buffer.byteLength(JSON.stringify(backup.data)),
      mtime: Date.parse(backup.created_at) || 0,
      revision: String(result?.revision || ""),
    };
  }

  async function snapshot(key) {
    if (!cloud) return snapshotJsonFile(localFile(key), backupDir, key);
    const current = cache.get(key);
    if (!current) return null;
    const rows = await request("/rest/v1/pkc_backups", {
      method: "POST",
      headers: cloudHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify([{
        key,
        data: current.data,
        revision: Number(current.revision) || 1,
        created_by: "manual",
      }]),
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? {
      name: String(row.id),
      key,
      size: Buffer.byteLength(JSON.stringify(current.data)),
      mtime: Date.parse(row.created_at) || Date.now(),
      revision: current.revision,
    } : null;
  }

  async function readAudit(limit = 50) {
    if (!cloud) {
      try {
        const file = path.join(backupDir, "audit.json");
        const entries = JSON.parse(fs.readFileSync(file, "utf8"));
        return (Array.isArray(entries) ? entries : [])
          .slice(-Math.max(1, Math.min(100, Number(limit) || 50)))
          .reverse();
      } catch {
        return [];
      }
    }
    const rows = await request("/rest/v1/pkc_audit?select=*", {
      headers: cloudHeaders(),
    });
    return (Array.isArray(rows) ? rows : [])
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
      .map((row) => ({
        at: row.created_at,
        action: row.action,
        key: row.record_key,
        detail: row.detail,
        actor: row.actor,
      }));
  }

  async function appendAudit(action, detail = "", key = "", actor = "") {
    const entry = {
      action: String(action || "unknown").slice(0, 80),
      record_key: String(key || "").slice(0, 40),
      detail: String(detail || "").slice(0, 500),
      actor: String(actor || "").slice(0, 200),
      created_at: new Date().toISOString(),
    };
    if (!cloud) {
      const file = path.join(backupDir, "audit.json");
      let entries = [];
      try {
        const current = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(current)) entries = current;
      } catch { /* first entry */ }
      entries.push({ at: entry.created_at, action: entry.action, key: entry.record_key, detail: entry.detail, actor: entry.actor });
      writeJsonAtomic(file, JSON.stringify(entries.slice(-200), null, 2), { backup: false });
      return entries.at(-1);
    }
    await request("/rest/v1/pkc_audit", {
      method: "POST",
      headers: cloudHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify([entry]),
    });
    return { at: entry.created_at, ...entry };
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  return {
    cloud,
    dataDir,
    initialize,
    refresh,
    hasCloudDataStore: () => cloud,
    readData,
    revisionOf,
    writeData,
    listBackups,
    restoreBackup,
    snapshot,
    readAudit,
    appendAudit,
    stop,
  };
}
