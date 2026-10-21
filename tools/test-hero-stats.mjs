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
assert.ok(csv.includes("英雄榜") && csv.includes("选手英雄池"), "CSV 应包含两张表");

// 手动录入：可以空 ban，5 个选手 + 英雄，按阶段/组别/轮次/队名合并
const manualInput = {
  stage: "循环赛", group: "1组", round: "第1轮", date: "10/01", gameNo: 1,
  teamLeft: "测试A", teamRight: "测试B", winner: "left",
  left: { bans: ["妲己", ""], players: [
    { name: "a1", hero: "公孙离" }, { name: "a2", hero: "貂蝉" }, { name: "a3", hero: "嫦娥" },
    { name: "a4", hero: "西施" }, { name: "a5", hero: "王昭君" }] },
  right: { bans: ["赵云"], players: [
    { name: "b1", hero: "杨玉环" }, { name: "b2", hero: "小乔" }, { name: "b3", hero: "大乔" },
    { name: "b4", hero: "瑶" }, { name: "b5", hero: "海月" }] },
};
let manual = addManualGame(normalizeHeroStats(null), manualInput);
assert.equal(manual.data.series.length, 1);
assert.equal(manual.data.series[0].games.length, 1);
assert.equal(manual.data.series[0].games[0].left.bans.length, 1, "空 ban 应被忽略");
assert.equal(manual.data.series[0].games[0].left.players.length, 5);
const mAgg1 = aggregateHeroStats(manual.data, { stage: "循环赛", minPicks: 0 });
assert.equal(mAgg1.summary.games, 1);
assert.equal(mAgg1.summary.picks, 10);
assert.equal(mAgg1.summary.players, 10);
assert.equal(mAgg1.summary.unresolvedClusters, 0, "手动英雄应自动登记为已确认簇");

manual = addManualGame(manual.data, { ...manualInput, gameNo: 2, winner: "right" });
assert.equal(manual.data.series.length, 1, "同系列赛应合并");
assert.equal(manual.data.series[0].games.length, 2);
assert.deepEqual(manual.data.series[0].seriesScore, [1, 1]);
manual = addManualGame(manual.data, { ...manualInput, gameNo: 1, winner: "right" });
assert.equal(manual.replaced, true);
assert.equal(manual.data.series[0].games.length, 2, "覆盖同局不应增加局数");

assert.throws(() => addManualGame(normalizeHeroStats(null), {
  ...manualInput,
  left: { ...manualInput.left, players: manualInput.left.players.map((p, i) => i === 1 ? { ...p, hero: "公孙离" } : p) },
}), /重复选择/);

console.log("test-hero-stats: ok");
