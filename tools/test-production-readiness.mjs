import assert from "node:assert/strict";
import { buildProductionReadiness } from "../lib/production-readiness.mjs";

const team = (id, name) => ({
  id,
  name,
  players: ["一号", "二号", "三号", "四号", "五号"],
  playerLanes: ["上单", "打野", "中路", "发育路", "游走"],
});

const player = (name, hero) => ({
  name,
  hero,
  k: "1",
  d: "1",
  a: "1",
  gold: "8000",
  dmgPct: "20",
  tankPct: "20",
  goldShare: "20",
  kp: "50",
});

const rows = (offset = 0) => ["上单", "打野", "中路", "发育路", "游走"].map((pos, index) => ({
  pos,
  posOpp: pos,
  our: player(`蓝${pos}`, `蓝英雄${index + offset}`),
  opp: player(`红${pos}`, `红英雄${index + offset}`),
}));

const library = {
  currentId: "s1",
  series: [{ id: "s1", name: "测试杯", teams: [team("b", "蓝队"), team("r", "红队")] }],
};

const matches = {
  games: {
    s1: [{
      id: "g1",
      label: "第1局",
      matchKey: "R16-1",
      ourId: "b",
      oppId: "r",
      ourScore: "12",
      oppScore: "8",
      duration: "12:10",
      result: "win",
      rows: rows(),
    }],
  },
};

const draw = Array.from({ length: 8 }, () => ({ a: "b", b: "r" }));
const bracket = { s1: { groups: {}, draw, win: {}, score: {} } };
const context = {
  seriesId: "s1",
  matchKey: "R16-1",
  gameId: "g1",
  blueId: "b",
  redId: "r",
  blueTeam: "蓝队",
  redTeam: "红队",
  updatedAt: "2026-10-23T10:00:00.000Z",
};

const ready = buildProductionReadiness({ library, matches, bracket, context });
assert.equal(ready.seriesId, "s1");
assert.equal(ready.scenes.find((scene) => scene.id === "commentary").status, "ready");
assert.equal(ready.scenes.find((scene) => scene.id === "chart").status, "ready");
assert.equal(ready.scenes.find((scene) => scene.id === "bracket").status, "blocked");
assert.equal(ready.overall.firstBlocker.code, "bracket_duplicate_team");
assert.equal(ready.scenes.find((scene) => scene.id === "blank").status, "ready");

const cleanBracket = {
  s1: {
    groups: {},
    draw: Array.from({ length: 8 }, (_, index) => ({
      a: index ? `x${index}` : "b",
      b: index ? `y${index}` : "r",
    })),
    win: {},
    score: {},
  },
};
const clean = buildProductionReadiness({ library, matches, bracket: cleanBracket, context });
assert.equal(clean.scenes.find((scene) => scene.id === "bracket").status, "ready");
assert.equal(clean.overall.firstBlocker, null);
assert.ok(clean.overall.readyCount >= 4);

const incompleteBracket = {
  s1: { groups: {}, draw: [{ a: "b", b: "" }], win: {}, score: {} },
};
const drawing = buildProductionReadiness({ library, matches, bracket: incompleteBracket, context });
assert.equal(drawing.scenes.find((scene) => scene.id === "bracket").status, "warning");

const incompleteMatch = structuredClone(matches);
incompleteMatch.games.s1[0].rows = rows().slice(0, 4);
const incomplete = buildProductionReadiness({
  library,
  matches: incompleteMatch,
  bracket: cleanBracket,
  context,
});
assert.equal(incomplete.scenes.find((scene) => scene.id === "chart").status, "blocked");
assert.equal(incomplete.scenes.find((scene) => scene.id === "chart").blockers[0].code, "chart_rows_incomplete");
assert.equal(incomplete.overall.firstBlocker.view, "data");

const missingContext = buildProductionReadiness({
  library,
  matches,
  bracket: cleanBracket,
  context: null,
});
assert.equal(missingContext.scenes.find((scene) => scene.id === "commentary").status, "blocked");
assert.equal(missingContext.scenes.find((scene) => scene.id === "blank").status, "ready");

console.log("test-production-readiness: ok");
