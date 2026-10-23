import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const port = 19800 + Math.floor(Math.random() * 300);
const pkc = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env:{ ...process.env, PKC_PORT:String(port), PKC_REMOTE:"1", PKC_OPEN:"0", PKC_DATA_DIR:data, DEEPSEEK_API_KEY:"secret-test", DEEPSEEK_BASE_URL:`http://127.0.0.1:${providerPort}` },
  stdio:"ignore", windowsHide:true,
});
let browser;
const getAccess = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/remote/access`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("远程录入测试服务未启动");
};
try {
  const access = await getAccess();
  browser = await chromium.launch({ channel:"msedge", headless:true });
  const desktop = await browser.newPage({ viewport:{ width:1680, height:1000 } });
  await desktop.goto(`http://127.0.0.1:${port}/`, { waitUntil:"load" });
  await desktop.click('.wk-item[data-view="data"]');
  await desktop.waitForFunction(() => document.querySelector("#genFrame")?.contentWindow?.PKC);

  const phone = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, acceptDownloads:true });
  await phone.goto(`http://127.0.0.1:${port}/remote`, { waitUntil:"load" });
  await phone.fill("#pin", access.pin);
  await phone.fill("#deviceName", "录入手机");
  await phone.click("#pairBtn");
  await phone.getByRole("button", { name:"对局录入" }).click();
  await phone.waitForFunction(() => document.querySelector("#remoteMatchSelect")?.options.length === 1);
  await phone.waitForFunction(() => document.querySelector("#remoteGameSelect")?.value === "__new__");

  await phone.setInputFiles("#remoteGallery", path.join(root, "assets", "pkc-emblem.png"));
  await phone.waitForFunction(() => !document.querySelector("#remoteOcrBtn")?.disabled);
  await phone.click("#remoteOcrBtn");
  await phone.waitForFunction(() => !document.querySelector("#remoteReviewCard")?.classList.contains("hidden"), null, { timeout:10000 });
  const reviewScreenshot = path.join(os.tmpdir(), "pkc-remote-entry-review.png");
  await phone.screenshot({ path:reviewScreenshot, fullPage:true });
  const firstHero = phone.locator('[data-side="our"][data-row="0"][data-field="hero"]');
  await firstHero.fill("廉颇");
  await phone.fill("#remoteDuration", "12:31");
  phone.once("dialog", (dialog) => dialog.accept());
  await phone.click("#remoteSaveBtn");
  await phone.waitForFunction(() => document.querySelector("#remoteSaveStatus")?.textContent.includes("已保存"), null, { timeout:12000 });
  await desktop.waitForFunction(() => document.querySelector("#genFrame")?.contentDocument?.querySelector("#pkcContextStatus")?.textContent.includes("手机已更新"), null, { timeout:12000 });

  const disk = JSON.parse(fs.readFileSync(path.join(data, "matches.json"), "utf8"));
  if (disk.games.s1[0].duration !== "12:31") throw new Error("手机核对后的时长未写入电脑");
  console.log(JSON.stringify({ remoteDataUi:true, desktopNotice:true, savedGame:disk.games.s1[0].label, reviewScreenshot }, null, 2));
} finally {
  if (browser) await browser.close();
  pkc.kill();
  provider.close();
  fs.rmSync(temp, { recursive:true, force:true });
}
