import assert from "node:assert/strict";
import { buildSeasonInsights } from "../lib/season-insights.mjs";

const pick = (hero) => ({ cluster: "manual-pick-" + encodeURIComponent(hero) });
const ban = (hero) => ({ cluster: "manual-ban-" + encodeURIComponent(hero) });
const side = (team, players, heroes, bans = []) => ({
  team,
  side: "蓝方",
  picks: heroes.map(pick),
  bans: bans.map(ban),
  players: players.map((name, index) => ({ name, cluster: pick(heroes[index]).cluster })),
});

const library = {
  currentId: "s1",
  series: [{
    id: "s1",
    name: "测试赛季",
    teams: [
      { id: "t1", name: "甲队", group: "一组", players: ["甲一", "甲二", "甲三", "甲四", "甲五"], playerLanes: ["上单", "打野", "中路", "发育路", "游走"] },
      { id: "t2", name: "乙队", group: "一组", players: ["乙一", "乙二", "乙三", "乙四", "乙五"], playerLanes: ["上单", "打野", "中路", "发育路", "游走"] },
      { id: "t3", name: "丙队", group: "二组", players: ["丙一", "丙二", "丙三", "丙四", "丙五"], playerLanes: ["上单", "打野", "中路", "发育路", "游走"] },
    ],
  }],
};

const validGame = {
  no: 1,
  winner: "left",
  left: side("甲队", ["甲一", "甲二", "甲三", "甲四", "甲五"], ["廉颇", "赵云", "王昭君", "公孙离", "张飞"], ["盾山", "大乔", "露娜", "关羽"]),
  right: side("乙队", ["乙一", "乙二", "乙三", "乙四", "乙五"], ["白起", "韩信", "小乔", "后羿", "庄周"], ["吕布", "曹操", "镜", "蒙恬"]),
};
const noDataGame = { no: 2, winner: "right", noData: true, left: null, right: null };
const conflictGame = { no: 3, winner: "left", conflict: true, left: null, right: null };
const groupSeries = {
  id: "group-a-1",
  stage: "循环赛",
  group: "1组",
  round: "第一轮",
  date: "10/20",
  teams: ["甲队", "乙队"],
  seriesScore: [2, 1],
  forfeit: false,
  noData: false,
  conflict: false,
  games: [validGame, noDataGame, conflictGame],
};
const forfeitSeries = {
  id: "group-a-2",
  stage: "循环赛",
  group: "1组",
  round: "第二轮",
  date: "10/21",
  teams: ["乙队", "丙队"],
  seriesScore: [0, 2],
  forfeit: true,
  noData: true,
  conflict: false,
  games: [{ no: 1, winner: "right", noData: true, left: null, right: null }],
};
const heroStats = { series: [groupSeries, groupSeries, forfeitSeries] };

const bracket = {
  s1: {
    groups: { A: ["t1", "t2"], B: ["t3"], C: [], D: [] },
    draw: [
      { a: "t1", b: "t2" },
      { a: "t3", b: "" },
    ],
    win: {},
    score: {},
  },
};

const insights = buildSeasonInsights({ library, matches: { games: { s1: [] } }, bracket, heroStats, seriesId: "s1" });
assert.equal(insights.meta.seriesId, "s1");
assert.equal(insights.meta.officialMatches, 2);
assert.equal(insights.meta.forfeitMatches, 1);
assert.equal(insights.meta.stageProgress.total, 1);
assert.equal(insights.meta.stageProgress.completed, 0);
assert.equal(insights.meta.remainingTeams, 3);
assert.equal(insights.dataQuality.validGames, 1);
assert.equal(insights.dataQuality.noDataGames, 2);
assert.equal(insights.dataQuality.conflictGames, 1);

const first = insights.teams.find((team) => team.id === "t1");
const second = insights.teams.find((team) => team.id === "t2");
const third = insights.teams.find((team) => team.id === "t3");
assert.deepEqual([first.wins, first.losses], [1, 0]);
assert.deepEqual([second.wins, second.losses], [0, 2]);
assert.deepEqual([third.wins, third.losses], [1, 0]);
assert.equal(first.group, "一组");
assert.equal(insights.headToHead.meetings.length, 1);
assert.equal(insights.headToHead.meetings[0].score[0], 2);

const zhaojun = insights.heroes.find((hero) => hero.hero === "王昭君");
assert.equal(zhaojun.picks, 1);
assert.equal(zhaojun.wins, 1);
assert.equal(zhaojun.winRate, 100);
assert.equal(zhaojun.smallSample, true);
assert.ok(insights.heroes.some((hero) => hero.hero === "盾山" && hero.bans === 1));

const teamPool = insights.players.find((item) => item.player === "甲队");
assert.equal(teamPool.team, "甲队");
assert.equal(teamPool.games, 1);
assert.ok(teamPool.heroes.some((hero) => hero.hero === "王昭君"));
assert.equal(insights.mvp[0].player, "甲队");

const empty = buildSeasonInsights({ library, matches: { games: { s1: [] } }, bracket, heroStats: { series: [] }, seriesId: "s1" });
assert.equal(empty.meta.officialMatches, 0);
assert.equal(empty.heroes.length, 0);
assert.equal(empty.teams.every((team) => team.winRate === null), true);
assert.equal(empty.mvp.length, 0);
assert.ok(empty.warnings.some((warning) => warning.code === "no_official_results"));
assert.ok(empty.warnings.some((warning) => warning.code === "no_hero_games"));

const groupOnly = buildSeasonInsights({ library, matches: { games: { s1: [] } }, bracket, heroStats, seriesId: "s1", stage: "group" });
assert.equal(groupOnly.meta.stageFilter, "group");
assert.equal(groupOnly.meta.officialMatches, 2);
assert.equal(groupOnly.dataQuality.validGames, 1);
const knockoutOnly = buildSeasonInsights({ library, matches: { games: { s1: [] } }, bracket, heroStats, seriesId: "s1", stage: "knockout" });
assert.equal(knockoutOnly.meta.officialMatches, 0);
assert.equal(knockoutOnly.dataQuality.validGames, 0);
const invalidTeams = buildSeasonInsights({ library, matches: { games: { s1: [] } }, bracket, heroStats, seriesId: "s1", leftId:"missing", rightId:"missing" });
assert.equal(invalidTeams.headToHead.leftId, "t1");
assert.equal(invalidTeams.headToHead.rightId, "t2");
const incompleteMatch = buildSeasonInsights({
  library,
  matches: { games: { s1: [{ id:"g1", matchKey:"R16-1", ourId:"t1", oppId:"t2", result:"win", rows:[] }] } },
  bracket,
  heroStats: { series: [] },
  seriesId: "s1",
});
assert.equal(incompleteMatch.dataQuality.missingGames, 1);

console.log("test-season-insights: ok");
