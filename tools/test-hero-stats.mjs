import assert from "node:assert/strict";
import {
  normalizeHeroStats, mergeSeries, mergeClusters, applyLabels,
  isCountableGame, validateGame, aggregateHeroStats, toCSV, seriesId, recountClusters, addManualGame,
} from "../lib/hero-stats.mjs";

const C = (n) => `c${n}`;
const picks = (start) => Array.from({ length: 5 }, (_, i) => ({ order: [3, 4, 5, 9, 10][i], cluster: C(start + i) }));
const bans = (start) => Array.from({ length: 5 }, (_, i) => ({ cluster: C(start + i) }));
const players = (start, team) => Array.from({ length: 5 }, (_, i) => ({ name: `${team}选手${i + 1}`, cluster: C(start + i) }));

const clusters = {};
for (let i = 0; i < 40; i++) clusters[C(i)] = { hero: `英雄${i}`, confirmed: true, count: 1 };

const game = (no, winner, lStart, rStart) => ({
  no, winner, duration: "12:23", noData: false,
  left: { team: "A", side: "红方", picks: picks(lStart), bans: bans(lStart + 20), players: players(lStart, "A") },
  right: { team: "B", side: "蓝方", picks: picks(rStart), bans: bans(rStart + 20), players: players(rStart, "B") },
});

let data = normalizeHeroStats({ event: "2026PKC秋季赛", stage: "循环赛", clusters });
data = mergeSeries(data, {
  id: seriesId({ stage: "循环赛", group: "1组", round: "第1轮", teams: ["A", "B"] }),
  stage: "循环赛", group: "1组", round: "第1轮", teams: ["A", "B"], seriesScore: [2, 0], forfeit: true,
  games: [
    { no: 1, noData: true, left: { team: "A" }, right: { team: "B" } },
    game(2, "right", 0, 5),
  ],
});
data = mergeSeries(data, {
  id: seriesId({ stage: "循环赛", group: "1组", round: "第2轮", teams: ["A", "C"] }),
  stage: "循环赛", group: "1组", round: "第2轮", teams: ["A", "C"], seriesScore: [2, 1],
  games: [game(1, "left", 10, 15), game(2, "right", 10, 15), game(3, "left", 10, 15)],
});

assert.equal(isCountableGame(data.series[0].games[0]), false, "noData 局不能进分母");
assert.equal(isCountableGame(data.series[0].games[1]), true, "真实局应可统计");
assert.deepEqual(validateGame(data.series[1].games[0]), [], "正常局不应有冲突");

let agg = aggregateHeroStats(data, { stage: "循环赛", minPicks: 0 });
assert.equal(agg.summary.series, 2, "两场系列赛");
assert.equal(agg.summary.games, 4, "只有 4 个真实局");
assert.equal(agg.summary.noDataGames, 1, "判负局记 noData");
assert.equal(agg.summary.forfeitSeries, 1, "判负系列赛记 forfeit");
assert.equal(agg.heroes.find((h) => h.hero === "英雄15").picks, 3, "B 方反复用同一英雄应累计");
assert.equal(agg.heroes.find((h) => h.hero === "英雄15").wins, 1, "只在该队获胜局计胜场");
assert.equal(agg.heroes.find((h) => h.hero === "英雄0").picks, 1, "判负局的选择不应进入英雄榜");

// 标签传播：把 c15 改成“东皇太一”，所有出场自动跟着变
data = applyLabels(data, { c15: { hero: "东皇太一", confirmed: true, source: "manual" } });
agg = aggregateHeroStats(data, { stage: "循环赛", minPicks: 0 });
assert.ok(agg.heroes.some((h) => h.hero === "东皇太一" && h.picks === 3), "改一次簇标签应传播到全部出场");
assert.ok(!agg.heroes.some((h) => h.hero === "英雄15"), "旧英雄名不应残留");

// 阶段筛选
data = mergeSeries(data, {
  id: "淘汰赛-8进4-A-B", stage: "淘汰赛", group: "", round: "8进4", teams: ["A", "B"],
  seriesScore: [3, 1], games: [game(1, "left", 20, 25)],
});
assert.equal(aggregateHeroStats(data, { stage: "循环赛", minPicks: 0 }).summary.games, 4);
assert.equal(aggregateHeroStats(data, { stage: "淘汰赛", minPicks: 0 }).summary.games, 1);
assert.equal(aggregateHeroStats(data, { stage: "all", minPicks: 0 }).summary.games, 5);

// 簇计数重算：重复 ingest 不会越加越大
const rc1 = recountClusters(data);
const c0 = "c10";
assert.equal(rc1.clusters[c0].count, 3, "同一个英雄在三场里出场三次");
const rc2 = recountClusters(rc1);
assert.equal(rc2.clusters[c0].count, 3, "重算应幂等");

// 同队重复选择：标 conflict，不参与统计
const bad = game(1, "left", 0, 5);
bad.left.picks[4] = { ...bad.left.picks[0] };
bad.conflict = true;
assert.equal(isCountableGame(bad), false, "冲突局不能进分母");
assert.ok(validateGame(bad).some((x) => x.includes("duplicate")), "应识别重复选择");

// 英雄榜默认 minPicks
assert.ok(aggregateHeroStats(data, { stage: "循环赛", minPicks: 3 }).heroes.every((h) => h.picks >= 3));

// CSV 带 BOM，方便 Excel 直接打开
const csv = toCSV(aggregateHeroStats(data, { stage: "循环赛", minPicks: 0 }));
assert.ok(csv.startsWith("\uFEFF"), "CSV 应带 BOM");
assert.ok(csv.includes("英雄榜") && csv.includes("队伍英雄池") && csv.includes("英雄排行榜"), "CSV 应包含三类榜单");

// 手动录入：可以空 ban，每队 5 个英雄，按阶段/组别/轮次/队名合并
const manualInput = {
  stage: "循环赛", group: "1组", round: "第1轮", date: "10/01", gameNo: 1,
  teamLeft: "测试A", teamRight: "测试B", winner: "left",
  left: { bans: ["妲己", ""], picks: ["公孙离", "貂蝉", "嫦娥", "西施", "王昭君"] },
  right: { bans: ["赵云"], picks: ["杨玉环", "小乔", "大乔", "瑶", "海月"] },
};
let manual = addManualGame(normalizeHeroStats(null), manualInput);
assert.equal(manual.data.series.length, 1);
assert.equal(manual.data.series[0].games.length, 1);
assert.equal(manual.data.series[0].games[0].left.bans.length, 1, "空 ban 应被忽略");
assert.equal(manual.data.series[0].games[0].left.players.length, 0, "不再保存选手");
assert.equal(manual.data.series[0].games[0].left.picks.length, 5);
const mAgg1 = aggregateHeroStats(manual.data, { stage: "循环赛", minPicks: 0 });
assert.equal(mAgg1.summary.games, 1);
assert.equal(mAgg1.summary.picks, 10);
assert.equal(mAgg1.summary.teams, 2);
assert.equal(mAgg1.summary.unresolvedClusters, 0, "手动英雄应自动登记为已确认簇");
assert.ok(mAgg1.teams.every((row) => row.name === "测试A" || row.name === "测试B"));

manual = addManualGame(manual.data, { ...manualInput, gameNo: 2, winner: "right" });
assert.equal(manual.data.series.length, 1, "同系列赛应合并");
assert.equal(manual.data.series[0].games.length, 2);
assert.deepEqual(manual.data.series[0].seriesScore, [1, 1]);
manual = addManualGame(manual.data, { ...manualInput, gameNo: 1, winner: "right" });
assert.equal(manual.replaced, true);
assert.equal(manual.data.series[0].games.length, 2, "覆盖同局不应增加局数");

assert.throws(() => addManualGame(normalizeHeroStats(null), {
  ...manualInput,
  left: { picks: ["公孙离", "公孙离", "嫦娥", "西施", "王昭君"] },
}), /重复选择/);

const legacy = normalizeHeroStats({
  series: [{
    stage: "循环赛", group: "1组", round: "旧数据", teams: ["旧甲", "旧乙"],
    games: [{
      no: 1, winner: "left",
      left: {
        team: "旧甲",
        picks: [],
        players: ["甲一", "甲二", "甲三", "甲四", "甲五"].map((name, index) => ({
          name, cluster: `manual-pick-${encodeURIComponent("旧英雄" + (index + 1))}`,
        })),
      },
      right: {
        team: "旧乙",
        picks: ["乙英雄1", "乙英雄2", "乙英雄3", "乙英雄4", "乙英雄5"].map((hero, index) => ({
          order: index + 1, cluster: `manual-pick-${encodeURIComponent(hero)}`,
        })),
        players: [{ name: "乙一", cluster: "manual-pick-ignored" }],
      },
    }],
  }],
  clusters: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [
    `manual-pick-${encodeURIComponent("旧英雄" + n)}`,
    { hero: "旧英雄" + n, confirmed: true },
  ]).concat(["乙英雄1", "乙英雄2", "乙英雄3", "乙英雄4", "乙英雄5"].map((hero) => [
    `manual-pick-${encodeURIComponent(hero)}`,
    { hero, confirmed: true },
  ]))),
});
assert.equal(legacy.series[0].games[0].left.players.length, 0, "旧选手名应被清掉");
assert.equal(legacy.series[0].games[0].left.picks.length, 5, "没有 picks 时从旧选手记录补齐");
assert.equal(legacy.series[0].games[0].right.players.length, 0);
assert.equal(legacy.series[0].games[0].right.picks.length, 5, "已有 picks 时不被选手记录覆盖");
const legacyAgg = aggregateHeroStats(legacy, { minPicks: 0 });
assert.deepEqual(legacyAgg.teams.map((row) => row.name).sort(), ["旧乙", "旧甲"]);

// 队伍前三英雄、英雄前三队伍
const rankingInputs = [
  { gameNo: 1, left: "排行甲", right: "排行乙", leftHeroes: ["榜首", "甲二", "甲三", "甲四", "甲五"], rightHeroes: ["乙英雄1", "乙英雄2", "乙英雄3", "乙英雄4", "乙英雄5"] },
  { gameNo: 2, left: "排行甲", right: "排行乙", leftHeroes: ["榜首", "次席", "甲三", "甲四", "甲五"], rightHeroes: ["乙英雄6", "乙英雄7", "乙英雄8", "乙英雄9", "乙英雄10"] },
  { gameNo: 1, left: "排行丙", right: "排行丁", leftHeroes: ["榜首", "丙二", "丙三", "丙四", "丙五"], rightHeroes: ["丁英雄1", "丁英雄2", "丁英雄3", "丁英雄4", "丁英雄5"] },
];
let ranking = normalizeHeroStats(null);
for (const item of rankingInputs) {
  ranking = addManualGame(ranking, {
    stage: "淘汰赛", group: "", round: item.left + item.right, gameNo: item.gameNo,
    teamLeft: item.left, teamRight: item.right, winner: "left",
    left: { bans: [], picks: item.leftHeroes },
    right: { bans: [], picks: item.rightHeroes },
  }).data;
}
const rankingAgg = aggregateHeroStats(ranking, { stage: "淘汰赛", minPicks: 0 });
const teamOne = rankingAgg.teams.find((row) => row.name === "排行甲");
assert.equal(teamOne.topHeroes[0].hero, "榜首");
assert.equal(teamOne.topHeroes.length, 3);
assert.ok(teamOne.topHeroes.every((hero) => hero.winRate === 100));
const topHero = rankingAgg.heroes.find((hero) => hero.hero === "榜首");
assert.deepEqual(topHero.topTeams.map((row) => row.name), ["排行甲", "排行丙"]);
assert.equal(topHero.topTeams[0].games, 2);
assert.equal(topHero.topTeams[1].games, 1);

console.log("test-hero-stats: ok");
