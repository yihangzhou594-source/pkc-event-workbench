import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./json-store.mjs";
import { normalizeHeroStats } from "./hero-stats.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, "数据");
const STORE = path.join(DATA_DIR, "heroStats.json");

export function readHeroStats() {
  try {
    return normalizeHeroStats(JSON.parse(fs.readFileSync(STORE, "utf8").replace(/^\uFEFF/, "")));
  } catch {
    return normalizeHeroStats(null);
  }
}

export function writeHeroStats(data) {
  const next = normalizeHeroStats(data);
  writeJsonAtomic(STORE, JSON.stringify(next, null, 2), {
    backupDir: path.join(DATA_DIR, "_backup"),
    key: "heroStats",
  });
  return next;
}
