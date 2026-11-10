import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const chartNames = ["top", "jungle", "mid", "bottom", "support", "overview"];
export const chartBundleLimit = 24 * 1024 * 1024;
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");

export function validChartBundle(images) {
  return images && Object.keys(images).length === chartNames.length && chartNames.every(name => {
    const value = images[name];
    return typeof value === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
      && Buffer.from(value.slice(0, 12), "base64").subarray(0, 8).equals(pngSignature);
  });
}

export function createChartStorage({ directory, cloud }) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const bucket = process.env.PKC_CHART_STORAGE_BUCKET || "pkc-game-charts";
  function filename(seriesId, gameId) {
    return createHash("sha256").update(JSON.stringify([seriesId, gameId])).digest("hex") + ".json";
  }
  async function cloudRequest(name, options) {
    if (!base || !serviceKey) throw new Error("Chart storage configuration missing");
    return fetch(base + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + name, {
      ...options,
      headers: {apikey: serviceKey, Authorization: "Bearer " + serviceKey, ...options?.headers},
    });
  }
  return {
    async read(seriesId, gameId) {
      const name = filename(seriesId, gameId);
      if (cloud) {
        const response = await cloudRequest(name);
        if (response.status === 404) return null;
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          if (String(error?.statusCode) === "404" && /object/i.test(error?.message || error?.error || "")) return null;
          throw new Error("Chart storage read failed");
        }
        return response.json();
      }
      try { return JSON.parse(await readFile(path.join(directory, name), "utf8")); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    },
    async write(seriesId, gameId, bundle) {
      const name = filename(seriesId, gameId);
      const body = JSON.stringify(bundle);
      if (cloud) {
        const response = await cloudRequest(name, {
          method: "POST", body, headers: {"Content-Type": "application/json", "x-upsert": "true"},
        });
        if (!response.ok) throw new Error("Chart storage write failed");
        return;
      }
      await mkdir(directory, {recursive:true});
      const temp = path.join(directory, randomUUID() + ".tmp");
      try {
        await writeFile(temp, body, {flag:"wx"});
        await rename(temp, path.join(directory, name));
      } finally {
        await rm(temp, {force:true});
      }
    },
  };
}
