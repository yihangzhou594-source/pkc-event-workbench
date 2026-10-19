/**
 * 端到端验证新版生成器：打开本地服务页面 → 注入示例数据 → 导出真实 PNG → 截图
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ROOT = "D:/Agent data/Codex/PKC比赛图表制作";
const OUT = path.join(ROOT, "预览");
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = [
  "我方\t上单\t图南\t吕布\t5\t2\t7\t7911\t652\t24.5%\t19.3%\t23.0%\t80.0%\t-\t-\t6.76",
  "对方\t上单\t主峰城\t关羽\t3\t4\t5\t6349\t615\t29.4%\t5.8%\t14.8%\t86.7%\t-\t-\t10.06",
  "我方\t打野\t长坂坡\t露娜\t8\t1\t9\t6133\t704\t27.8%\t22.6%\t17.8%\t61.0%\t-\t-\t5.20",
  "对方\t打野\tAzzy\t镜\t4\t6\t4\t8293\t648\t22.1%\t14.2%\t19.3%\t80.0%\t-\t-\t7.40",
  "我方\t中路\t栀力夏\t不知火舞\t6\t3\t11\t6410\t668\t25.3%\t23.5%\t18.6%\t100.0%\t-\t-\t4.80",
  "对方\t中路\tgaadbye\t西施\t2\t5\t8\t11185\t641\t20.3%\t15.8%\t26.0%\t93.3%\t-\t-\t9.10",
  "我方\t发育路\t夏半星\t伽罗\t9\t2\t6\t8020\t726\t20.8%\t18.4%\t23.3%\t100.0%\t-\t-\t6.30",
  "对方\t发育路\tYrainy\t公孙离\t5\t7\t3\t7578\t702\t14.3%\t29.5%\t17.6%\t60.0%\t-\t-\t7.10",
  "我方\t游走\t相遇猫鼠\t王维\t1\t3\t16\t5980\t452\t11.6%\t21.9%\t17.4%\t80.0%\t-\t-\t1.40",
  "对方\t游走\t久低\t鲁班大师\t0\t8\t11\t9549\t438\t29.3%\t19.4%\t22.2%\t73.3%\t-\t-\t2.30"
].join("\n");

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", m => {
  if (m.type() === "error" && !m.text().includes("ERR_FAILED")) problems.push("console: " + m.text());
});
page.on("pageerror", e => problems.push("pageerror: " + e.message));

await page.route("**/api/store/**", r => r.request().method() === "POST" ? r.abort() : r.continue());
const GENERATOR = "http://localhost:8971/generator";
await page.goto(GENERATOR, { waitUntil: "load" });
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const boot = await page.evaluate(() => {
  const db = window.PKC.db();
  return {
    store: window.PKC.db() ? "ok" : "no",
    series: db.series.map(s => ({ name:s.name, teams:s.teams.length, games:s.games.length })),
    heroes: window.PKC.heroes() ? Object.keys(window.PKC.heroes().heroes).length : 0,
    issues: window.PKC.heroes() ? window.PKC.heroes().issues : []
  };
});

// 注入示例数据并渲染
const filled = await page.evaluate((txt) => {
  window.PKC.parseLines(txt);
  window.PKC.game().duration = "12:11";
  window.PKC.game().ourScore = "2";
  window.PKC.game().oppScore = "1";
  window.PKC.render();
  return window.PKC.game().rows.map(r => [r.pos, r.our.name, r.our.hero, r.opp.name, r.opp.hero]);
}, SAMPLE);

// 等英雄图加载
await page.waitForTimeout(2500);
await page.evaluate(() => window.PKC.render());
await page.waitForTimeout(800);

const shots = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("#preview canvas")).map((c, i) => ({
    i, w: c.width, h: c.height, url: c.toDataURL("image/png")
  }));
});
shots.forEach(s => {
  const pos = ["上单","打野","中路","发育路","游走"][s.i];
  const name = (s.i < 5 ? ("示例-" + (s.i+1) + "-" + pos + "对位图") : "示例-6-五路总览") + ".png";
  fs.writeFileSync(path.join(OUT, name), Buffer.from(s.url.split(",")[1], "base64"));
});

// 导出全尺寸对位图（第一张）用于验收
const full = await page.evaluate(() => {
  const c = window.PKC.drawExport({ kind:"card", game: window.PKC.game(), idx: 0 }, 1920, 1080);
  return { url: c.toDataURL("image/png"), w: c.width, h: c.height };
});
fs.writeFileSync(path.join(OUT, "示例-全尺寸-上单对位图.png"), Buffer.from(full.url.split(",")[1], "base64"));

// 多局对比图
const multi = await page.evaluate(() => {
  const db = window.PKC.db(), s = window.PKC.series();
  const g1 = JSON.parse(JSON.stringify(s.games[0]));
  g1.label = "第2局"; g1.result = "lose"; g1.ourScore = "1"; g1.oppScore = "2";
  g1.rows.forEach(r => { r.our.k = String((+r.our.k||0) + 1); r.opp.d = String((+r.opp.d||0) + 2); });
  s.games.push(g1);
  const c = window.PKC.drawExport({ kind:"multi" }, 1920, 1080);
  return { url: c.toDataURL("image/png"), games: s.games.length };
});
fs.writeFileSync(path.join(OUT, "示例-7-多局对比.png"), Buffer.from(multi.url.split(",")[1], "base64"));

// 界面截图
await page.screenshot({ path: path.join(OUT, "界面预览-对局数据.png"), clip: { x:0, y:0, width:1680, height:1050 } });
await page.evaluate(() => window.PKC.switchTab("hero"));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "界面预览-英雄图.png"), clip: { x:0, y:0, width:1680, height:1050 } });
await page.evaluate(() => window.PKC.switchTab("teams"));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "界面预览-队伍库.png"), clip: { x:0, y:0, width:1680, height:1050 } });

// 英雄候选 / 匹配检查
const heroCheck = await page.evaluate(() => {
  const out = {};
  ["吕布","露娜","不知火舞","伽罗","张飞","关羽","镜","西施","公孙离","鲁班大师"].forEach(h => {
    const c = window.PKC.heroCandidates(h);
    out[h] = c.length + (c.length ? " (" + c.map(x => x.rel).join(" | ") + ")" : "");
  });
  out["__陈咬金"] = String(window.PKC.heroCandidates("陈咬金").length);
  out["__程咬金"] = String(window.PKC.heroCandidates("程咬金").length);
  out["__不存在的英雄"] = String(window.PKC.heroCandidates("螃蟹怪").length);
  return out;
});

await browser.close();
console.log(JSON.stringify({ problems, boot, filled, previewShots: shots.map(s => s.w+"x"+s.h), fullSize: full.w+"x"+full.h, multiGames: multi.games, heroCheck }, null, 2));


