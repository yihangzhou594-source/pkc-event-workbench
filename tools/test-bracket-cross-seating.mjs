import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-bracket-cross-"));
const sourceData = path.join(root, "数据");
for (const name of fs.readdirSync(sourceData)) {
  if (name.endsWith(".json")) {
    fs.copyFileSync(path.join(sourceData, name), path.join(temp, name));
  }
}

const port = 22000 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PKC_PORT: String(port), PKC_OPEN: "0", PKC_DATA_DIR: temp },
  stdio: "ignore",
  windowsHide: true,
});
const api = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(api + "/api/ping");
      if (response.ok) return;
    } catch {
      // Retry while the local test server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("赛程图测试服务未能启动");
}

const teamIds = Array.from({ length: 16 }, (_, index) => "T" + (index + 1));
const draw = Array.from({ length: 8 }, (_, index) => ({
  a: teamIds[index * 2],
  b: teamIds[index * 2 + 1],
}));
const wins = {
  "R16-1": "a", "R16-2": "a", "R16-3": "a", "R16-4": "a",
  "R16-5": "a", "R16-6": "a", "R16-7": "a", "R16-8": "a",
  "WB1-1": "a", "WB1-2": "a", "WB1-3": "a", "WB1-4": "a",
  "WB2-1": "a", "WB2-2": "a",
  "LB1-1": "a", "LB1-2": "a",
  "LB2-1": "a", "LB2-2": "a", "LB3": "a", "WBF": "a", "LBF": "a",
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  await page.route("**/api/store/**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue());
  await page.goto(api + "/generator", { waitUntil: "load" });
  await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

  const generator = await page.evaluate(({ drawInput, winInput }) => {
    const bracket = window.PKC.bracket();
    const teams = window.PKC.series().teams;
    if (teams.length < 16) throw new Error("测试需要至少 16 支队伍");
    const ids = teams.slice(0, 16).map((team) => team.id);
    bracket.draw = drawInput.map(({ a, b }) => ({
      a: ids[Number(a.slice(1)) - 1],
      b: ids[Number(b.slice(1)) - 1],
    }));
    bracket.win = { ...winInput, GF: "b", GF2: "b" };
    const first = window.PKC.bkMatchByKey("LB2-1");
    const second = window.PKC.bkMatchByKey("LB2-2");
    const final = window.PKC.bkMatchByKey("GF");
    return {
      ids,
      first: { a: first.a, b: first.b, aLabel: first.aLabel, bLabel: first.bLabel },
      second: { a: second.a, b: second.b, aLabel: second.aLabel, bLabel: second.bLabel },
      hasReset: window.PKC.bkMatchList().some((match) => match.key === "GF2"),
      champion: window.PKC.bkChampion(),
      finalWinner: final.b,
    };
  }, { drawInput: draw, winInput: wins });

  const expected = {
    first: { a: generator.ids[2], b: generator.ids[12] },
    second: { a: generator.ids[10], b: generator.ids[4] },
  };
  if (generator.first.a !== expected.first.a || generator.first.b !== expected.first.b) {
    throw new Error("主生成器 LB2-1 未按交叉落位：" + JSON.stringify(generator.first));
  }
  if (generator.second.a !== expected.second.a || generator.second.b !== expected.second.b) {
    throw new Error("主生成器 LB2-2 未按交叉落位：" + JSON.stringify(generator.second));
  }
  if (generator.first.bLabel !== "胜半决2 败者" || generator.second.bLabel !== "胜半决1 败者") {
    throw new Error("主生成器交叉落位标签错误：" + JSON.stringify(generator));
  }
  if (generator.hasReset) {
    throw new Error("赛程仍生成了不存在的总决赛加赛");
  }
  if (!generator.finalWinner || generator.champion !== generator.finalWinner) {
    throw new Error("总决赛胜者未直接成为冠军：" + JSON.stringify(generator));
  }
  if (generator.champion !== generator.ids[2]) {
    throw new Error("总决赛胜者对应的冠军队伍错误：" + JSON.stringify(generator));
  }

  const leftChannelCalls = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2560;
    canvas.height = 1440;
    const context = canvas.getContext("2d");
    const prototype = Object.getPrototypeOf(context);
    const original = prototype.lineTo;
    const calls = [];
    prototype.lineTo = function patchedLineTo(x, y) {
      if (x >= 10 && x < 30) calls.push([x, y]);
      return original.call(this, x, y);
    };
    try {
      window.PKC.drawBkDE(context, 0, { footer: false });
    } finally {
      prototype.lineTo = original;
    }
    return calls;
  });
  if (leftChannelCalls.length !== 0) {
    throw new Error("双败图仍绘制了左侧落位虚线：" + JSON.stringify(leftChannelCalls));
  }
  const previewData = await page.evaluate(() => {
    return window.PKC.drawExport({ kind: "bkde" }, 1280, 720).toDataURL("image/png");
  });
  const previewPath = path.join(os.tmpdir(), "pkc-bracket-no-reset.png");
  fs.writeFileSync(previewPath, Buffer.from(previewData.split(",")[1], "base64"));

  const obsPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await obsPage.goto(api + "/obs/bracket", { waitUntil: "load" });
  await obsPage.waitForFunction(() => typeof cmBracketMatches === "function");
  const obs = await obsPage.evaluate(({ drawInput, winInput }) => {
    const matches = cmBracketMatches({ draw: drawInput, win: { ...winInput, GF: "b", GF2: "b" } });
    const pick = (key) => {
      const match = matches.find((item) => item.key === key);
      return { a: match.a, b: match.b };
    };
    return {
      first: pick("LB2-1"),
      second: pick("LB2-2"),
      hasReset: matches.some((match) => match.key === "GF2"),
    };
  }, { drawInput: draw, winInput: wins });

  const expectedObs = {
    first: { a: "T3", b: "T13" },
    second: { a: "T11", b: "T5" },
  };
  if (JSON.stringify({ first: obs.first, second: obs.second }) !== JSON.stringify(expectedObs)) {
    throw new Error("OBS 赛程图未按交叉落位：" + JSON.stringify(obs));
  }
  if (obs.hasReset) {
    throw new Error("OBS 赛程图仍生成了不存在的总决赛加赛");
  }

  console.log(JSON.stringify({ generator, obs, previewPath }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
