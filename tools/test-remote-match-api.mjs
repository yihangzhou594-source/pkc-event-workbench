import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-remote-match-"));
const data = path.join(temp, "data");
fs.mkdirSync(data, { recursive: true });
const blue = { id:"b", name:"蓝队", group:"一组", players:["蓝一","蓝二","蓝三","蓝四","蓝五"], playerLanes:["上单","打野","中路","发育路","游走"] };
const red = { id:"r", name:"红队", group:"一组", players:["红一","红二","红三","红四","红五"], playerLanes:["上单","打野","中路","发育路","游走"] };
const library = { currentId:"s1", series:[{ id:"s1", name:"测试杯", teams:[blue, red] }] };
const bracket = { s1:{ title:"测试杯", groups:{}, draw:[{a:"b",b:"r"}], win:{}, score:{} } };
const matches = { games:{ s1:[] } };
const context = { seriesId:"s1", seriesName:"测试杯", matchKey:"R16-1", matchLabel:"R16-1 · 蓝队 vs 红队", blueId:"b", redId:"r", blueTeam:"蓝队", redTeam:"红队", gameId:"", revision:1, updatedAt:new Date().toISOString() };
for (const [name, value] of [["library",library],["bracket",bracket],["matches",matches],["context",context],["heroPick",{}],["prefs",{}]]) {
  fs.writeFileSync(path.join(data, name + ".json"), JSON.stringify(value, null, 2));
}

const ocrData = {
  blue: blue.players.map((name, index) => ({ name, hero:"蓝英雄" + index, k:2, d:1, a:4, gold:8000 + index * 100, dmgPct:20, tankPct:20, goldShare:20, kp:60, dmgRaw:20000 + index * 1000 })),
  red: red.players.map((name, index) => ({ name, hero:"红英雄" + index, k:1, d:2, a:3, gold:7000 + index * 100, dmgPct:20, tankPct:20, goldShare:20, kp:50, dmgRaw:18000 + index * 1000 })),
  duration:"12:30",
};
let providerRequests = 0;
let providerFail = false;
const provider = http.createServer((req, res) => {
  providerRequests++;
  if (providerFail) {
    res.writeHead(500, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ error:{ message:"provider failed" } }));
    return;
  }
  const body = JSON.stringify({ choices:[{ message:{ content:JSON.stringify(ocrData) }, finish_reason:"stop" }], usage:{ total_tokens:123 } });
  res.writeHead(200, { "Content-Type":"application/json" });
  res.end(body);
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerPort = provider.address().port;
const pkcPort = 19400 + Math.floor(Math.random() * 300);
const pkc = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PKC_PORT:String(pkcPort),
    PKC_REMOTE:"1",
    PKC_MATCH_API_KEY_HASHES:createHash("sha256").update("fixture-key").digest("hex"),
    PKC_OPEN:"0",
    PKC_DATA_DIR:data,
    DEEPSEEK_API_KEY:"test-secret-key",
    DEEPSEEK_BASE_URL:`http://127.0.0.1:${providerPort}`,
  },
  stdio:"ignore",
  windowsHide:true,
});

const wait = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/access`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("测试服务未启动");
};

try {
  const access = await wait();
  const pair = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/pair`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ pin:access.pin, deviceName:"API 测试手机" }),
  });
  const paired = await pair.json();
  assert.equal(pair.status, 200);
  const cookie = pair.headers.get("set-cookie").split(";")[0];
  const headers = { "Content-Type":"application/json", Cookie:cookie, "X-PKC-CSRF":paired.csrf };

  const catalogResponse = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/match-context`, { headers:{ Cookie:cookie } });
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalog.matches[0].matchKey, "R16-1");
  assert.ok(catalog.matchesRevision);

  const invalid = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST", headers,
    body:JSON.stringify({ matchKey:"R16-1", images:["data:text/plain;base64,SGVsbG8="] }),
  });
  assert.equal(invalid.status, 400);
  const noCsrf = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", Cookie:cookie },
    body:JSON.stringify({ matchKey:"R16-1", images:["data:image/png;base64,AA=="] }),
  });
  assert.equal(noCsrf.status, 403);
  const tooMany = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST", headers,
    body:JSON.stringify({ matchKey:"R16-1", images:Array(5).fill("data:image/png;base64,AA==") }),
  });
  assert.equal(tooMany.status, 400);
  const tooLarge = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST", headers,
    body:JSON.stringify({ matchKey:"R16-1", images:["data:image/jpeg;base64," + "A".repeat(14 * 1024 * 1024)] }),
  });
  assert.equal(tooLarge.status, 400);

  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZP7sAAAAASUVORK5CYII=";
  const ocrResponse = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST", headers,
    body:JSON.stringify({ matchKey:"R16-1", gameId:null, blueId:"r", images:[pixel] }),
  });
  const ocr = await ocrResponse.json();
  assert.equal(ocrResponse.status, 200, JSON.stringify(ocr));
  assert.equal(ocr.draft.blueId,"r");
  assert.equal(ocr.draft.rows.length, 5);
  assert.equal(ocr.draft.blueScore, "10");
  assert.equal(providerRequests, 1);
  assert.ok(!JSON.stringify(ocr).includes("test-secret-key"));
  assert.ok(!JSON.stringify(ocr).includes("data:image"));

  ocr.draft.rows[0].our.hero = "廉颇";
  ocr.draft.duration = "12:31";
  ocr.draft.rows[0].our.k = 0;
  ocr.draft.rows[0].our.dmgPct = "12.345";
  const savedResponse = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/match-data`, {
    method:"POST", headers,
    body:JSON.stringify({
      seriesId:"s1", matchKey:"R16-1", gameId:null, baseRev:catalog.matchesRevision, draft:ocr.draft,
    }),
  });
  const saved = await savedResponse.json();
  assert.equal(savedResponse.status, 200, JSON.stringify(saved));
  assert.equal(saved.game.ourId,"r");
  assert.equal(saved.game.oppId,"b");
  assert.equal(saved.game.label, "第1局");
  assert.equal(saved.game.rows[0].our.hero, "廉颇");
  const api = `http://127.0.0.1:${pkcPort}/api/v1/series`;
  const apiHeaders = {Authorization:"Bearer fixture-key"};
  const detailUrl = api + "/s1/games/" + saved.game.id;
  const chartUrl = detailUrl + "/charts";
  const get = async (url) => {
    const response = await fetch(url, {headers:apiHeaders});
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await fetch(api)).status, 401);
  assert.equal((await fetch(api, {headers:{Authorization:"Bearer revoked-key"}})).status, 401);
  assert.equal((await fetch(api, {method:"POST", headers:apiHeaders})).status, 405);
  assert.deepEqual((await get(api)).series, [{id:"s1", name:"测试杯"}]);
  const detail = (await get(detailUrl)).game;
  assert.equal(detail.blue.teamId, "r");
  assert.equal(detail.red.teamId, "b");
  assert.equal(detail.blue.players[0].hero, "廉颇");
  assert.equal(detail.blue.players[0].metrics.k, "0");
  assert.equal(detail.blue.players[0].metrics.dmgPct, "12.345");
  assert.equal(detail.blue.players[0].metrics.cs, null);
  assert.equal(detail.chartsUrl, new URL(chartUrl).pathname);
  assert.equal((await get(api + "/s1/games?matchKey=R16-1&limit=1")).games[0].id, saved.game.id);
  assert.deepEqual((await get(api + "/s1/games?offset=1")).games, []);
  assert.deepEqual((await get(api + "/s1/games?matchKey=absent")).games, []);
  assert.deepEqual((await get(chartUrl)).charts, []);
  const png = pixel.split(",")[1];
  const images = Object.fromEntries(["top","jungle","mid","bottom","support","overview"].map(name => [name,png]));
  const chartWrite = await fetch(new URL("/api/game-charts", api), {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({seriesId:"s1", gameId:saved.game.id, images}),
  });
  assert.equal(chartWrite.status, 200, await chartWrite.text());
  assert.equal((await get(chartUrl)).charts.length, 6);
  assert.equal((await fetch(chartUrl + "/overview.png")).status, 401);
  const image = await fetch(chartUrl + "/overview.png", {headers:apiHeaders});
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(png,"base64"));

  const disk = JSON.parse(fs.readFileSync(path.join(data, "matches.json"), "utf8"));
  assert.equal(disk.games.s1[0].rows[0].our.hero, "廉颇");
  assert.equal(disk.games.s1[0].duration, "12:31");
  const contextDisk = JSON.parse(fs.readFileSync(path.join(data, "context.json"), "utf8"));
  assert.equal(contextDisk.gameId, saved.game.id);
  assert.ok(contextDisk.remoteSavedAt);

  const conflict = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/match-data`, {
    method:"POST", headers,
    body:JSON.stringify({
      seriesId:"s1", matchKey:"R16-1", gameId:saved.game.id, baseRev:catalog.matchesRevision, draft:ocr.draft,
    }),
  });
  assert.equal(conflict.status, 409);
  ocr.draft.duration = "12:32";
  const overwrite = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/match-data`, {
    method:"POST", headers,
    body:JSON.stringify({
      seriesId:"s1", matchKey:"R16-1", gameId:saved.game.id, overwriteLatest:true, draft:ocr.draft,
    }),
  });
  assert.equal(overwrite.status, 200, await overwrite.text());
  assert.equal((await get(detailUrl)).game.duration, "12:32");
  assert.equal((await get(chartUrl)).charts.length, 6);

  const audit = JSON.parse(fs.readFileSync(path.join(data, "_backup", "audit.json"), "utf8"));
  assert.ok(audit.some((entry) => entry.action === "remote-upload-save"));

  const nextOcr = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {method:"POST",headers,body:JSON.stringify({matchKey:"R16-1",images:[pixel]})});
  assert.equal(nextOcr.status,200);
  assert.equal((await nextOcr.json()).draft.blueId,"b");
  providerFail = true;
  const providerError = await fetch(`http://127.0.0.1:${pkcPort}/api/remote/ocr-draft`, {
    method:"POST", headers,
    body:JSON.stringify({ matchKey:"R16-1", images:[pixel] }),
  });
  assert.equal(providerError.status, 502);

  const noKeyPort = pkcPort + 1;
  const noKeyServer = spawn(process.execPath, ["server.mjs"], {
    cwd:root,
    env:{ ...process.env, PKC_PORT:String(noKeyPort), PKC_REMOTE:"1", PKC_OPEN:"0", PKC_DATA_DIR:data, DEEPSEEK_API_KEY:"", DEEPSEEK_BASE_URL:"http://127.0.0.1:9" },
    stdio:"ignore", windowsHide:true,
  });
  try {
    let noKeyAccess;
    for (let i = 0; i < 50; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${noKeyPort}/api/remote/access`);
        if (response.ok) { noKeyAccess = await response.json(); break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    assert.ok(noKeyAccess, "无 Key 测试服务未启动");
    const noKeyPairResponse = await fetch(`http://127.0.0.1:${noKeyPort}/api/remote/pair`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ pin:noKeyAccess.pin, deviceName:"no-key" }),
    });
    const noKeyPair = await noKeyPairResponse.json();
    const noKeyCookie = noKeyPairResponse.headers.get("set-cookie").split(";")[0];
    const noKeyOcr = await fetch(`http://127.0.0.1:${noKeyPort}/api/remote/ocr-draft`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", Cookie:noKeyCookie, "X-PKC-CSRF":noKeyPair.csrf },
      body:JSON.stringify({ matchKey:"R16-1", images:[pixel] }),
    });
    assert.equal(noKeyOcr.status, 503);
    assert.ok(!(await noKeyOcr.text()).includes("test-secret-key"));
  } finally {
    noKeyServer.kill();
  }
  console.log("test-remote-match-api: ok");
} finally {
  pkc.kill();
  provider.close();
  fs.rmSync(temp, { recursive:true, force:true });
}
