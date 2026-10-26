import assert from "node:assert/strict";
import {
  applyMatchBans,
  buildHeroStatsWithMatchData,
  listMatchGamesForHeroStats,
} from "../lib/hero-stats-sync.mjs";
import { aggregateHeroStats, normalizeHeroStats } from "../lib/hero-stats.mjs";

const library = {
  currentId: "event-1",
  series: [{
    id: "event-1",
    name: "测试赛事",
    teams: [
      { id: "blue", name: "蓝队", group: "一组" },
      { id: "red", name: "红队", group: "二组" },
    ],
  }],
};

const matches = {
  games: {
    "event-1": [{
      id: "game-1",
      label: "第1局",
      matchKey: "R16-1",
      ourId: "blue",
      oppId: "red",
      ourScore: "12",
      oppScore: "8",
      result: "win",
      rows: [
        ["蓝一", "红一"], ["蓝二", "红二"], ["蓝三", "红三"],
        ["蓝四", "红四"], ["蓝五", "红五"],
      ].map(([blueHero, redHero], index) => ({
        pos: ["上单", "打野", "中路", "发育路", "游走"][index],
        posOpp: ["上单", "打野", "中路", "发育路", "游走"][index],
        our: { hero: blueHero, name: `蓝方${index}` },
        opp: { hero: redHero, name: `红方${index}` },
      })),
    }],
  },
};

const catalog = listMatchGamesForHeroStats({ library, matches });
assert.equal(catalog.games.length, 1, "上传局应出现在赛事禁用目录");
assert.equal(catalog.games[0].stage, "淘汰赛", "上传局必须归入淘汰赛");
assert.deepEqual(catalog.games[0].leftHeroes, ["蓝一", "蓝二", "蓝三", "蓝四", "蓝五"]);
assert.deepEqual(catalog.games[0].rightHeroes, ["红一", "红二", "红三", "红四", "红五"]);
assert.equal(catalog.games[0].countable, true, "完整上传局应可统计");

const manual = normalizeHeroStats({
  series: [{
    id: "manual-1",
    stage: "循环赛",
    group: "1组",
    round: "第1轮",
    teams: ["手动甲", "手动乙"],
    games: [{
      no: 1,
      winner: "left",
      left: {
        team: "手动甲",
        picks: ["甲一", "甲二", "甲三", "甲四", "甲五"].map((hero) => ({
          cluster: `manual-pick-${encodeURIComponent(hero)}`,
        })),
        bans: [],
      },
      right: {
        team: "手动乙",
        picks: ["乙一", "乙二", "乙三", "乙四", "乙五"].map((hero) => ({
          cluster: `manual-pick-${encodeURIComponent(hero)}`,
        })),
        bans: [],
      },
    }],
  }],
  clusters: Object.fromEntries(
    ["甲一", "甲二", "甲三", "甲四", "甲五", "乙一", "乙二", "乙三", "乙四", "乙五"]
      .map((hero) => [`manual-pick-${encodeURIComponent(hero)}`, { hero, confirmed: true }]),
  ),
});

const combined = buildHeroStatsWithMatchData({ library, matches, manual });
const agg = aggregateHeroStats(combined, { stage: "all", minPicks: 0 });
assert.equal(agg.summary.games, 2, "手动局和上传局应同时进入统计");
assert.equal(agg.heroes.find((hero) => hero.hero === "蓝一").wins, 1, "上传局胜方英雄应计胜场");
assert.equal(agg.heroes.find((hero) => hero.hero === "蓝一").bans, 0, "上传局禁用默认为空");

const withBans = applyMatchBans(combined, {
  seriesId: "event-1",
  gameId: "game-1",
  left: ["BanA", "BanB"],
  right: ["BanC"],
}, catalog.games[0]);
const banAgg = aggregateHeroStats(withBans, { stage: "淘汰赛", minPicks: 0 });
assert.equal(banAgg.heroes.find((hero) => hero.hero === "BanA").bans, 1);
assert.equal(banAgg.heroes.find((hero) => hero.hero === "BanB").bans, 1);
assert.equal(banAgg.heroes.find((hero) => hero.hero === "BanC").bans, 1);
assert.equal(banAgg.summary.bans, 3, "禁用只来自手工补充");

assert.throws(() => applyMatchBans(withBans, {
  seriesId: "event-1",
  gameId: "game-1",
  left: ["蓝一"],
  right: [],
}, catalog.games[0]), /不能同时选择/);
assert.throws(() => applyMatchBans(withBans, {
  seriesId: "event-1",
  gameId: "game-1",
  left: ["重复Ban"],
  right: ["重复Ban"],
}, catalog.games[0]), /不能重复/);

console.log("test-hero-stats-sync: ok");
