import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.route("**/api/store/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.route("**/api/director/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.goto("http://127.0.0.1:8971/generator", { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  const [blueTeam, redTeam] = s.teams;
  const emptyGame = (label, key, ourId, oppId, duration, ourScore, oppScore) => {
    const g = window.PKC.newGame(label, key);
    g.ourId = ourId;
    g.oppId = oppId;
    g.duration = duration;
    g.ourScore = String(ourScore);
    g.oppScore = String(oppScore);
    return g;
  };
  const setLane = (g, index, pos, side, player) => {
    const row = g.rows[index];
    row[side === "our" ? "pos" : "posOpp"] = pos;
    Object.assign(row[side], player);
  };

  const g1 = emptyGame("第1局", "R16-5", blueTeam.id, redTeam.id, "10:00", 10, 5);
  setLane(g1, 0, "上单", "our", {
    name: "甲", hero: "曹操", k: "1", d: "2", a: "3", gold: "6000", dmgWan: "3",
  });
  setLane(g1, 0, "上单", "opp", {
    name: "乙", hero: "白起", k: "2", d: "1", a: "1", gold: "5000", dmgWan: "2",
  });
  setLane(g1, 1, "打野", "our", {
    name: "丙", hero: "镜", k: "2", d: "1", a: "1", gold: "4000", dmgWan: "1",
  });

  const g2 = emptyGame("第2局", "R16-5", redTeam.id, blueTeam.id, "20:00", 4, 12);
  setLane(g2, 1, "打野", "opp", {
    name: "甲", hero: "澜", k: "4", d: "1", a: "2", gold: "12000", dmgWan: "6",
  });
  setLane(g2, 1, "打野", "our", {
    name: "乙", hero: "镜", k: "1", d: "3", a: "2", gold: "9000", dmgWan: "4",
  });
  setLane(g2, 2, "中路", "opp", {
    name: "丙", hero: "王昭君", k: "1", d: "2", a: "3", gold: "8000", dmgWan: "2",
  });

  const other = emptyGame("第1局", "R16-1", blueTeam.id, redTeam.id, "10:00", 99, 0);
  setLane(other, 0, "上单", "our", {
    name: "甲", hero: "曹操", k: "99", d: "0", a: "99", gold: "99999", dmgWan: "99",
  });

  s.games = [g1, g2, other];
  s.current = 0;
  return {
    summary: window.PKC.bigMatchSummary(),
    missingPercent: window.PKC.summaryPercent(null),
  };
});
const render = await page.evaluate(() => {
  const hash = (kind) => {
    const canvas = window.PKC.drawExport({ kind }, 1920, 1080);
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let h = 2166136261;
    for (let i = 0; i < data.length; i += 97) h = Math.imul(h ^ data[i], 16777619);
    return { width: canvas.width, height: canvas.height, hash: h >>> 0 };
  };
  return { summary: hash("bigMatch"), multi: hash("multi") };
});
const summaryButton = page.locator("#btnBigMatchDown");
if (await summaryButton.count() !== 1) throw new Error("导出页应提供大场数据汇总下载按钮");
await page.evaluate(() => window.PKC.switchTab("out"));
const [download] = await Promise.all([
  page.waitForEvent("download"),
  summaryButton.click(),
]);
const downloadName = download.suggestedFilename();
const [zip] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.locator("#btnZip2").click(),
]);
const zipPath = await zip.path();
const zipBytes = await fs.readFile(zipPath);
await browser.close();

const summary = out.summary;
const player = summary.blue && summary.blue.players.find((p) => p.name === "甲");
console.log(JSON.stringify({
  games: summary.games,
  durationMin: summary.durationMin,
  player,
  blue: summary.blue,
}, null, 2));

if (summary.games !== 2) throw new Error("大场汇总应只统计当前 matchKey 的两局");
if (summary.durationMin !== 30) throw new Error("大场汇总时长应为 30 分钟");
if (!player) throw new Error("应按固定队伍归并换边后的同一选手");
if (player.k !== 5 || player.d !== 3 || player.a !== 5) {
  throw new Error("KDA 应先跨局累加击杀/死亡/助攻");
}
if (Math.abs(player.kda - 10 / 3) > 0.001) throw new Error("KDA 比值应使用累计 K/D/A 重算");
if (Math.abs(player.gpm - 600) > 0.001) throw new Error("分均经济应为累计经济 ÷ 总时长");
if (Math.abs(player.damage - 9) > 0.001) throw new Error("总伤害应累计为 9 万");
if (Math.abs(player.dmgPerMin - 0.3) > 0.001) throw new Error("分均伤害应为累计伤害 ÷ 总时长");
if (Math.abs(player.kp - 1000 / 22) > 0.001) throw new Error("参团率应按累计击杀助攻 ÷ 队伍总击杀");
if (Math.abs(player.dmgPerGold - 5) > 0.001) throw new Error("经济转伤应按累计伤害 ÷ 累计经济");
if (Math.abs(summary.blue.kda - 17 / 6) > 0.001) throw new Error("队伍合计也应从累计完成 KDA 重算");
if (Math.abs(summary.blue.gpm - 1000) > 0.001) throw new Error("队伍分均经济只应除以整场时长一次");
if (summary.blue.kp !== null) throw new Error("队伍合计不应展示无意义的个人参团率合计");
if (out.missingPercent !== "—") throw new Error("缺少参团率时应显示短横线，而不是 —%");
if (render.summary.width !== 1920 || render.summary.height !== 1080) {
  throw new Error("大场汇总图应使用现有 1920×1080 导出尺寸");
}
if (render.summary.hash === render.multi.hash) {
  throw new Error("大场汇总导出不应继续回退到多局对比图");
}
if (!downloadName.includes("大场数据汇总") || !downloadName.endsWith(".png")) {
  throw new Error("大场汇总下载文件名应明确标注并输出 PNG：" + downloadName);
}
if (!zipBytes.includes(Buffer.from("大场数据汇总.png"))) {
  throw new Error("打包 ZIP 应包含大场数据汇总图");
}
