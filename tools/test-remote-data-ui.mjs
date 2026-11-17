import { launchBrowser, startTestServer } from "./browser-test-fixture.mjs"; // playwright
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-remote-ui-"));
const data = path.join(temp, "data");
fs.mkdirSync(data, { recursive: true });
const blue = { id:"b", name:"蓝队", players:["蓝一","蓝二","蓝三","蓝四","蓝五"], playerLanes:["上单","打野","中路","发育路","游走"] };
const red = { id:"r", name:"红队", players:["红一","红二","红三","红四","红五"], playerLanes:["上单","打野","中路","发育路","游走"] };
const library = { currentId:"s1", series:[{ id:"s1", name:"测试杯", teams:[blue, red] }] };
const bracket = { s1:{ title:"测试杯", groups:{}, draw:[{a:"b",b:"r"}], win:{}, score:{} } };
const context = { seriesId:"s1", seriesName:"测试杯", matchKey:"R16-1", matchLabel:"R16-1 · 蓝队 vs 红队", blueId:"b", redId:"r", blueTeam:"蓝队", redTeam:"红队", gameId:"", revision:1, updatedAt:new Date().toISOString() };
for (const [name, value] of [["library",library],["bracket",bracket],["matches",{games:{s1:[]}}],["context",context],["heroPick",{}],["prefs",{}]]) {
  fs.writeFileSync(path.join(data, name + ".json"), JSON.stringify(value, null, 2));
}
const ocrData = {
  blue: blue.players.map((name, index) => ({ name, hero:"廉颇", k:2, d:1, a:4, gold:8000, dmgPct:20, tankPct:20, goldShare:20, kp:60, dmgRaw:20000 })),
  red: red.players.map((name, index) => ({ name, hero:"白起", k:1, d:2, a:3, gold:7000, dmgPct:20, tankPct:20, goldShare:20, kp:50, dmgRaw:18000 })),
  duration:"12:30",
};
const provider = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type":"application/json" });
  res.end(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(ocrData) }, finish_reason:"stop" }], usage:{} }));
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerPort = provider.address().port;
let pkc;
let browser;
try {
  pkc = await startTestServer(data, {
    PKC_REMOTE:"1", PKC_PUBLIC_URL:"https://live.pkchku.com",
    DEEPSEEK_API_KEY:"secret-test", DEEPSEEK_BASE_URL:`http://127.0.0.1:${providerPort}`,
  });
  const access = await (await fetch(pkc.url + "/api/remote/access")).json();
  browser = await launchBrowser();
  const desktop = await browser.newPage({ viewport:{ width:1680, height:1000 } });
  await desktop.goto(`${pkc.url}/`, { waitUntil:"load" });
  await desktop.waitForFunction(() => document.querySelector("#remoteMode")?.textContent === "公网已开启");
  await desktop.click('.wk-item[data-view="data"]');
  await desktop.waitForFunction(() => document.querySelector("#genFrame")?.contentWindow?.PKC);

  const phone = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, acceptDownloads:true });
  await phone.goto(`${pkc.url}/remote`, { waitUntil:"load" });
  if ((await phone.locator("#pairView").innerText()).includes("同一 Wi-Fi")) {
    throw new Error("云端远程页不应要求手机与电脑处于同一 Wi-Fi");
  }
  await phone.fill("#pin", access.pin);
  await phone.fill("#deviceName", "录入手机");
  await phone.click("#pairBtn");
  if (await phone.getByRole("button", { name:"推送此画面" }).count()) throw new Error("手机端仍有直播推送");
  await phone.waitForFunction(() => document.querySelector("#remoteMatchSelect")?.options.length === 1);
  await phone.waitForFunction(() => document.querySelector("#remoteGameSelect")?.value === "__new__");

  await phone.setInputFiles("#remoteGallery", path.join(root, "assets", "pkc-emblem.png"));
  await phone.waitForFunction(() => !document.querySelector("#remoteOcrBtn")?.disabled);
  await phone.click("#remoteOcrBtn");
  await phone.getByRole("dialog").getByRole("button", { name:"取消" }).click();
  await phone.click("#remoteOcrBtn");
  await phone.getByRole("dialog").locator('button[value="0"]').click();
  await phone.waitForFunction(() => !document.querySelector("#remoteReviewCard")?.classList.contains("hidden"), null, { timeout:10000 });
  const reviewScreenshot = path.join(os.tmpdir(), "pkc-remote-entry-review.png");
  await phone.screenshot({ path:reviewScreenshot, fullPage:true });
  const firstHero = phone.locator('[data-side="our"][data-row="0"][data-field="hero"]');
  await firstHero.fill("廉颇");
  await phone.fill("#remoteDuration", "12:31");
  await phone.reload();
  await phone.waitForFunction(() => document.querySelector("#remoteDuration")?.value === "12:31");
  if (await phone.locator("#remoteLanes select").count() !== 10) throw new Error("分路一览缺少选择器");
  if (await phone.locator("#remoteFiles img").count()) throw new Error("已识别图片未清理");
  phone.once("dialog", (dialog) => dialog.accept());
  await phone.click("#remoteSaveBtn");
  await phone.waitForFunction(() => document.querySelector("#remoteSaveStatus")?.textContent.includes("已保存"), null, { timeout:12000 });
  await desktop.waitForFunction(() => document.querySelector("#genFrame")?.contentDocument?.querySelector("#pkcContextStatus")?.textContent.includes("手机已更新"), null, { timeout:12000 });
  await desktop.waitForFunction(() => document.querySelector("#genFrame")?.contentWindow?.PKC?.series().games.some(game => game.duration === "12:31"));

  const disk = JSON.parse(fs.readFileSync(path.join(data, "matches.json"), "utf8"));
  if (disk.games.s1[0].duration !== "12:31") throw new Error("手机核对后的时长未写入电脑");
  await phone.setInputFiles("#remoteGallery", path.join(root, "assets", "pkc-emblem.png"));
  await phone.click("#remoteOcrBtn");
  await phone.waitForFunction(() => document.querySelector("#remoteDuration")?.value === "12:30");
  await phone.fill("#remoteDuration", "12:32");

  const generator = desktop.frames().find(frame => frame.url().includes("/generator"));
  await generator.evaluate(async (id) => {
    const game = PKC.series().games.find(item => item.id === id);
    game.duration = "19:00";
    if (!await PKC.save()) throw new Error("电脑端编辑未保存");
  }, disk.games.s1[0].id);

  phone.once("dialog", dialog => dialog.accept());
  await phone.click("#remoteSaveBtn");
  await phone.waitForFunction(() => document.querySelector("#remoteSaveStatus").textContent.includes("其他页面更新"));
  phone.once("dialog", dialog => dialog.accept());
  await phone.click("#remoteSaveBtn");
  await generator.waitForFunction((id) => PKC.series().games.find(item => item.id === id)?.duration === "12:32", disk.games.s1[0].id);
  const overwritten = JSON.parse(fs.readFileSync(path.join(data, "matches.json"), "utf8"));
  if (overwritten.games.s1.filter(game => game.matchKey === "R16-1").length !== 1) throw new Error("覆盖操作创建了重复小局");

  await phone.selectOption("#remoteGameSelect", "__new__");
  await phone.click("#remoteManual");
  await phone.fill("#remoteDuration", "13:00");
  const state = await (await fetch(pkc.url + "/api/director/state")).json();
  const bumped = await fetch(pkc.url + "/api/director/context", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(state.live.context),
  });
  if (!bumped.ok) throw new Error(await bumped.text());
  phone.once("dialog", dialog => dialog.accept());
  await phone.click("#remoteSaveBtn");
  await phone.locator("#remoteActivateBtn").waitFor({ state:"visible" });
  const pendingGames = JSON.parse(fs.readFileSync(path.join(data, "matches.json"), "utf8")).games.s1;
  const roundGames = pendingGames.filter(game => game.matchKey === "R16-1");
  if (roundGames.length !== 2 || !roundGames.some(game => game.duration === "13:00")) {
    throw new Error("切换冲突时新局未独立保存，场次局数：" + roundGames.length);
  }
  phone.once("dialog", dialog => dialog.accept());
  await phone.click("#remoteActivateBtn");
  await phone.waitForFunction(() => document.querySelector("#remoteSaveStatus").textContent.includes("已切换到 第2局"));
  await generator.waitForFunction(() => PKC.series().games.some(game => game.label === "第2局" && game.duration === "13:00"));
  console.log(JSON.stringify({ remoteDataUi:true, desktopNotice:true, savedGame:disk.games.s1[0].label, reviewScreenshot }, null, 2));
} finally {
  if (browser) await browser.close();
  await pkc?.stop();
  provider.close();
  fs.rmSync(temp, { recursive:true, force:true });
}
