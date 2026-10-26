import { getSharedDataStore } from "./data-store.mjs";
import { normalizeHeroStats } from "./hero-stats.mjs";

export function readHeroStats() {
  return normalizeHeroStats(getSharedDataStore().readData("heroStats", null));
}

export async function writeHeroStats(data, { actor = "" } = {}) {
  const next = normalizeHeroStats(data);
  const store = getSharedDataStore();
  const written = await store.writeData("heroStats", next, {
    baseRevision: store.revisionOf("heroStats"),
    actor,
  });
  if (!written.ok && written.conflict) {
    throw Object.assign(new Error("英雄数据已在其他页面更新，请刷新后重试"), {
      code: "hero_stats_conflict",
    });
  }
  return next;
}
