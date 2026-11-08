import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.route("**/api/store/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
await page.route("**/api/director/**", (route) =>
  route.request().method() === "POST" ? route.abort() : route.continue());
await page.goto("http://127.0.0.1:8971/generator", { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const result = await page.evaluate(() => {
  const series = window.PKC.series();
  const [blue, red] = series.teams;
  const game = (label, ourId, oppId) => {
    const next = window.PKC.newGame(label, "REF");
    next.ourId = ourId;
    next.oppId = oppId;
    next.duration = "10:00";
    return next;
  };
  const setPlayer = (g, rowIndex, side, lane, values) => {
    const row = g.rows[rowIndex];
    row[side === "our" ? "pos" : "posOpp"] = lane;
    Object.assign(row[side], values);
  };

  const g1 = game("第1局", blue.id, red.id);
  setPlayer(g1, 0, "our", "上单", { name: "蓝一", k: "1", d: "1", a: "0", gold: "6000" });
  setPlayer(g1, 0, "opp", "上单", { name: "红一", k: "3", d: "1", a: "0", gold: "7000" });
  const g2 = game("第2局", red.id, blue.id);
  setPlayer(g2, 0, "our", "上单", { name: "红二", k: "4", d: "2", a: "0", gold: "8000" });
  setPlayer(g2, 0, "opp", "上单", { name: "蓝二", k: "2", d: "2", a: "0", gold: "9000" });
  const g3 = game("第3局", blue.id, red.id);
  setPlayer(g3, 0, "our", "上单", { name: "蓝三", k: "6", d: "1", a: "0", gold: "10000" });
  setPlayer(g3, 0, "opp", "上单", { name: "红三", k: "8", d: "1", a: "0", gold: "11000" });

  series.games = [g1, g2, g3];
  series.current = 0;
  const references = window.PKC.laneReferencesForSeries(series);
  const midpointGame = game("基准验证", blue.id, red.id);
  setPlayer(midpointGame, 0, "our", "上单", { k: "4", d: "1", a: "0" });
  setPlayer(midpointGame, 0, "opp", "上单", { k: "8", d: "1", a: "0" });
  const normalized = window.PKC.normVals(
    window.PKC.lanePair(midpointGame, "上单"),
    references["上单"],
  );
  const items = window.PKC.chartItems();
  const exportItem = { kind: "card", idx: 0, game: g1, laneReferences: references };
  const kplPng = window.PKC.drawExport(exportItem, 1920, 1080).toDataURL("image/png");
  window.PKC.db().prefs.chartStyle = "classic";
  const classicPng = window.PKC.drawExport(exportItem, 1920, 1080).toDataURL("image/png");
  const overviewItem = { kind: "overview", idx: -1, game: g1, laneReferences: references };
  const classicOverviewPng = window.PKC.drawExport(overviewItem, 1920, 1080).toDataURL("image/png");
  window.PKC.db().prefs.chartStyle = "kpl";
  const kplOverviewPng = window.PKC.drawExport(overviewItem, 1920, 1080).toDataURL("image/png");
  return {
    referenceK: references["上单"].values.participations,
    referenceCount: references["上单"].counts.participations,
    midpoint: normalized.norm[4].our,
    doubleReference: normalized.norm[4].opp,
    pushedReferenceK: items[0]?.laneReferences?.["上单"]?.values?.participations,
    kplPng,
    classicPng,
    kplOverviewPng,
    classicOverviewPng,
  };
});

const kplPreviewPath = path.join(ROOT, "tmp", "lane-reference-preview.png");
const classicPreviewPath = path.join(ROOT, "tmp", "lane-reference-classic-preview.png");
const kplOverviewPath = path.join(ROOT, "tmp", "lane-reference-overview.png");
const classicOverviewPath = path.join(ROOT, "tmp", "lane-reference-classic-overview.png");
await fs.mkdir(path.dirname(kplPreviewPath), { recursive: true });
await fs.writeFile(kplPreviewPath, Buffer.from(result.kplPng.split(",")[1], "base64"));
await fs.writeFile(classicPreviewPath, Buffer.from(result.classicPng.split(",")[1], "base64"));
await fs.writeFile(kplOverviewPath, Buffer.from(result.kplOverviewPng.split(",")[1], "base64"));
await fs.writeFile(classicOverviewPath, Buffer.from(result.classicOverviewPng.split(",")[1], "base64"));
await browser.close();

console.log(JSON.stringify({
  referenceK: result.referenceK,
  referenceCount: result.referenceCount,
  midpoint: result.midpoint,
  doubleReference: result.doubleReference,
  pushedReferenceK: result.pushedReferenceK,
  kplPreviewPath,
  classicPreviewPath,
  kplOverviewPath,
  classicOverviewPath,
}, null, 2));

if (result.referenceK !== 4) throw new Error("同分路均值应汇总系列赛内双方全部有效样本");
if (result.referenceCount !== 6) throw new Error("上单 K 值应有 3 局 × 2 人共 6 个样本");
if (Math.abs(result.midpoint - 2/3) > 1e-9) throw new Error("同路均值应落在图表约 67%");
if (Math.abs(result.doubleReference - 4/3) > 1e-9) throw new Error("均值 2 倍的原始映射应为 4/3（绘制时限制在外圈）");
if (result.pushedReferenceK !== 4) throw new Error("导播台推送项应携带系列赛分路基准");
