import assert from "node:assert/strict";
import { setSharedDataStore } from "../lib/data-store.mjs";
import {
  readCompetitionContext,
  saveCompetitionContext,
} from "../lib/competition-context.mjs";
import {
  listCompetitionTeams,
  replaceCompetitionTeams,
} from "../lib/competition-teams.mjs";
import { readHeroStats, writeHeroStats } from "../lib/hero-stats-store.mjs";

function createFakeStore(initial = {}) {
  const documents = new Map(Object.entries(initial));
  const revisions = new Map(Object.keys(initial).map((key) => [key, 1]));
  const writes = [];
  return {
    documents,
    writes,
    hasCloudDataStore: () => true,
    readData(key, fallback = null) {
      return documents.has(key) ? documents.get(key) : fallback;
    },
    revisionOf(key) {
      return documents.has(key) ? String(revisions.get(key)) : "";
    },
    async writeData(key, data, options = {}) {
      const current = documents.has(key) ? String(revisions.get(key)) : "";
      if (options.baseRevision && options.baseRevision !== current) {
        return {
          ok: false,
          conflict: true,
          key,
          revision: current,
          error: "pkc_revision_conflict",
        };
      }
      const revision = (revisions.get(key) || 1) + 1;
      revisions.set(key, revision);
      documents.set(key, data);
      writes.push({ key, data, options, revision: String(revision) });
      return { ok: true, key, revision: String(revision) };
    },
  };
}

const store = createFakeStore({
  library: {
    currentId: "s1",
    series: [{
      id: "s1",
      name: "测试系列赛",
      teams: [{
        id: "blue",
        name: "蓝队",
        players: ["甲", "乙", "丙", "丁", "戊"],
        playerLanes: ["上单", "打野", "中路", "发育路", "游走"],
      }],
    }],
  },
  matches: { games: { s1: [{ id: "g1", matchKey: "R16-1" }] } },
  bracket: { s1: { score: { "R16-1": "1:0" } } },
  context: {
    seriesId: "s1",
    seriesName: "测试系列赛",
    matchKey: "R16-1",
    gameId: "g1",
    blueId: "blue",
    revision: 3,
  },
  heroStats: { manual: [] },
});
setSharedDataStore(store);

const context = readCompetitionContext();
assert.equal(context.revision, 3);
assert.equal(context.context.seriesId, "s1");

const savedContext = await saveCompetitionContext({
  ...context.context,
  gameLabel: "第1局",
}, 3);
assert.equal(savedContext.conflict, false);
assert.equal(savedContext.revision, 4);
assert.equal(store.writes.at(-1).key, "context");
assert.equal(store.writes.at(-1).options.baseRevision, "1");

const beforeTeams = listCompetitionTeams("s1");
assert.equal(beforeTeams.teams[0].name, "蓝队");
const savedTeams = await replaceCompetitionTeams("s1", beforeTeams.teams, beforeTeams.revision);
assert.equal(savedTeams.teams[0].name, "蓝队");
assert.equal(store.writes.at(-1).key, "library");

const stats = readHeroStats();
const savedStats = await writeHeroStats(stats);
assert.ok(savedStats);
assert.equal(store.writes.at(-1).key, "heroStats");

console.log("test-cloud-data-integration: ok");
