import assert from "node:assert/strict";
import { buildGroupSchedule } from "../lib/group-schedule.mjs";

const ids = {
  A: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"],
  B: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
  C: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
  D: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"],
};
const groupNames = { A: "一组", B: "二组", C: "三组", D: "四组" };
const eliminatedIds = new Set(["a1", "b2", "c3", "d4"]);
const library = {
  currentId: "s1",
  series: [{
    id: "s1",
    teams: Object.values(ids).flat().map((id) => ({
      id,
      name: id.toUpperCase(),
      group: groupNames[id[0].toUpperCase()],
      eliminated: eliminatedIds.has(id),
    })),
  }],
};
const bracket = {
  groups: {
    A: ids.A.slice(0, 4),
    B: ids.B.slice(0, 4),
    C: ids.C.slice(0, 4),
    D: ids.D.slice(0, 4),
  },
};

const schedule = buildGroupSchedule({ library, bracket, seriesId: "s1" });
assert.equal(schedule.groups.length, 4);
assert.equal(schedule.matches.length, 98, "7/7/8/8 队单循环应生成 98 场");

for (const key of Object.keys(ids)) {
  const games = schedule.matches.filter((game) => game.group === key + "组");
  const expectedGames = ids[key].length === 7 ? 21 : 28;
  assert.equal(games.length, expectedGames);
  assert.equal(new Set(games.map((game) => game.round)).size, 7, "7/8 队都应生成 7 轮");
  const pairs = games.map((game) => [game.left.id, game.right.id].sort().join("-"));
  assert.equal(new Set(pairs).size, expectedGames, "同一组每两队只交手一次");
  assert.ok(games.every((game) => game.left.id[0] === key.toLowerCase()));
}

assert.ok(schedule.matches.every((game) => game.left && game.right && !game.date));
assert.equal(new Set(schedule.matches.map((game) => game.id)).size, 98, "场次 ID 应唯一");
const eliminatedGames = schedule.matches.filter((game) =>
  game.left.eliminated || game.right.eliminated);
assert.ok(eliminatedGames.length > 0, "赛程必须保留队伍淘汰状态");
assert.ok(eliminatedGames.length > 0, "淘汰状态不能减少任何小组赛场次");
assert.ok(eliminatedGames.every((game) =>
  [game.left, game.right].filter((team) => team.eliminated)
    .every((team) => game.label.includes(team.name + "（已淘汰）"))),
"已淘汰队伍仍应出现在场次名称中");

const partial = buildGroupSchedule({
  library,
  bracket: { groups: { A: ["a1", "a2"] } },
  seriesId: "s1",
});
assert.equal(partial.groups.length, 4);
assert.equal(partial.matches.length, 98);
assert.ok(partial.matches.some((game) => game.left.id === "a1" || game.right.id === "a1"));

console.log("test-group-schedule: ok");
