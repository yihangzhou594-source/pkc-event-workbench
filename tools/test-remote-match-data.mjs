import assert from "node:assert/strict";
import {
  buildRemoteMatchContext,
  mergeRemoteDraft,
  buildRemoteGame,
  validateRemoteDraft,
} from "../lib/remote-match-data.mjs";

const blue = {
  id: "b", name: "蓝队", group: "一组",
  players: ["蓝一", "蓝二", "蓝三", "蓝四", "蓝五"],
  playerLanes: ["上单", "打野", "中路", "发育路", "游走"],
};
const red = {
  id: "r", name: "红队", group: "一组",
  players: ["红一", "红二", "红三", "红四", "红五"],
  playerLanes: ["上单", "打野", "中路", "发育路", "游走"],
};
const library = { currentId: "s1", series: [{ id: "s1", name: "测试杯", teams: [blue, red] }] };
const bracket = { s1: { groups: {}, draw: [{ a: "b", b: "r" }], win: {}, score: {} } };
const matches = {
  games: {
    s1: [{
      id: "g1", label: "第1局", matchKey: "R16-1", ourId: "b", oppId: "r",
      ourScore: "10", oppScore: "8", result: "win", duration: "12:00",
      rows: ["上单", "打野", "中路", "发育路", "游走"].map((pos, i) => ({
        pos, posOpp: pos,
        our: { name: blue.players[i], hero: "旧英雄", k: "1", d: "1", a: "1", gold: "7000" },
        opp: { name: red.players[i], hero: "旧对手", k: "1", d: "1", a: "1", gold: "7000" },
      })),
    }],
  },
};
const context = { seriesId: "s1", matchKey: "R16-1", gameId: "g1", blueId: "b", redId: "r" };

const catalog = buildRemoteMatchContext({ library, matches, bracket, context });
assert.equal(catalog.seriesId, "s1");
assert.equal(catalog.matches.length, 1);
assert.equal(catalog.matches[0].gameKey, "R16-1");
assert.equal(catalog.matches[0].blueId, "b");
assert.equal(catalog.matches[0].redId, "r");
assert.equal(catalog.matches[0].games[0].label, "第1局");
assert.equal(catalog.matches[0].nextGameLabel, "第2局");

const ocr = {
  blue: [
    { name: " 蓝 一 ", hero: "廉颇", k: 4, d: 2, a: 8, gold: 9000, dmgPct: 21, tankPct: 31, goldShare: 22, kp: 70, dmgRaw: 32000 },
    { name: "蓝二", hero: "赵云", k: 5, d: 1, a: 6, gold: 8800, dmgPct: 25, tankPct: 18, goldShare: 21, kp: 76, dmgRaw: 36000 },
    { name: "蓝三", hero: "王昭君", k: 3, d: 2, a: 9, gold: 8600, dmgPct: 28, tankPct: 11, goldShare: 20, kp: 80, dmgRaw: 41000 },
    { name: "蓝四", hero: "公孙离", k: 6, d: 1, a: 5, gold: 9400, dmgPct: 20, tankPct: 12, goldShare: 23, kp: 72, dmgRaw: 29000 },
    { name: "蓝五", hero: "张飞", k: 1, d: 3, a: 12, gold: 7200, dmgPct: 6, tankPct: 28, goldShare: 14, kp: 68, dmgRaw: 9000 },
  ],
  red: [
    { name: "红一", hero: "白起", k: 2, d: 4, a: 5, gold: 7600, dmgPct: 15, tankPct: 32, goldShare: 20, kp: 55, dmgRaw: 21000 },
    { name: "红二", hero: "韩信", k: 4, d: 3, a: 3, gold: 8100, dmgPct: 22, tankPct: 18, goldShare: 22, kp: 62, dmgRaw: 30000 },
    { name: "红三", hero: "小乔", k: 1, d: 5, a: 4, gold: 7900, dmgPct: 27, tankPct: 12, goldShare: 21, kp: 58, dmgRaw: 38000 },
    { name: "红四", hero: "后羿", k: 2, d: 4, a: 2, gold: 7800, dmgPct: 28, tankPct: 10, goldShare: 21, kp: 50, dmgRaw: 39000 },
    { name: "红五", hero: "庄周", k: 0, d: 4, a: 6, gold: 7000, dmgPct: 8, tankPct: 28, goldShare: 16, kp: 52, dmgRaw: 10000 },
  ],
  duration: "12:10",
};

const draft = mergeRemoteDraft({ ocr, existingGame: matches.games.s1[0], blueTeam: blue, redTeam: red });
assert.equal(draft.rows[0].our.name, "蓝一");
assert.equal(draft.rows[0].our.hero, "廉颇");
assert.equal(draft.rows[0].our.dmgWan, "3.2");
assert.equal(draft.duration, "12:10");
assert.equal(draft.blueScore, "19");
assert.equal(draft.redScore, "9");
assert.deepEqual(validateRemoteDraft(draft).missing, []);

const incomplete = mergeRemoteDraft({
  ocr: { blue: [{ name: "蓝一", hero: "廉颇", k: 1, d: 1, a: 1, gold: 5000 }], red: [], duration: "99:99" },
  existingGame: null,
  blueTeam: blue,
  redTeam: red,
});
const validation = validateRemoteDraft(incomplete);
assert.ok(validation.missing.some((item) => item.includes("蓝方")));
assert.ok(validation.missing.some((item) => item.includes("红方")));
assert.ok(validation.warnings.some((item) => item.includes("时长")));

const next = buildRemoteGame({
  seriesId: "s1",
  matchKey: "R16-1",
  blueTeam: blue,
  redTeam: red,
  draft,
  existingGames: matches.games.s1,
  gameId: "g2",
});
assert.equal(next.game.id, "g2");
assert.equal(next.game.label, "第2局");
assert.equal(next.game.ourId, "b");
assert.equal(next.game.oppId, "r");
assert.equal(next.game.rows.length, 5);
assert.equal(next.game.rows[0].our.gpm, "");
assert.equal(next.game.rows[0].our.dmgPerGold, "");

const replaced = buildRemoteGame({
  seriesId: "s1",
  matchKey: "R16-1",
  blueTeam: blue,
  redTeam: red,
  draft,
  existingGames: matches.games.s1,
  existingGame: matches.games.s1[0],
});
assert.equal(replaced.game.id, "g1");
assert.equal(replaced.game.rows[0].our.hero, "廉颇");
assert.equal(replaced.replaced, true);

assert.throws(
  () => buildRemoteGame({
    seriesId:"s1", matchKey:"R16-2", blueTeam:blue, redTeam:red, draft,
    existingGames:matches.games.s1, allowedMatchKeys:["R16-1"],
  }),
  /找不到目标场次/,
);

console.log("test-remote-match-data: ok");
