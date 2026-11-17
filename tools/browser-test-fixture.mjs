import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));

export async function launchBrowser() {
  const { chromium } = require(process.env.PKC_PW_ROOT
    ? path.join(process.env.PKC_PW_ROOT, "playwright") : "playwright");
  return chromium.launch({ headless:true, ...(process.env.PKC_TEST_BROWSER_CHANNEL
    ? { channel:process.env.PKC_TEST_BROWSER_CHANNEL } : {}) });
}

export async function startTestServer(data, overrides = {}) {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^(PKC_|SUPABASE_|DEEPSEEK_|PORT$)/i.test(name)));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd:root, env:{ ...env, ...overrides, PKC_PORT:"0", PKC_OPEN:"0", PKC_DATA_DIR:data },
    windowsHide:true, stdio:["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "close");
  async function stop() {
    child.kill();
    await exited;
  }
  try {
    let log = "";
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("测试服务未启动：" + log)), 12000);
      child.once("close", code => { clearTimeout(timer); reject(new Error("测试服务退出 " + code + "：" + log)); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.stderr.on("data", chunk => { log += chunk; });
      child.stdout.on("data", chunk => {
        log += chunk;
        const match = log.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve("http://127.0.0.1:" + match[1]);
        }
      });
    });
    return { url, stop };
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
}

export const contextFixture = {
  seriesId:"test-cup", seriesName:"测试杯", matchKey:"R16-1", matchLabel:"16强1 · 蓝队 vs 红队",
  matchRound:"16强赛", blueId:"blue", redId:"red", blueTeam:"蓝队", redTeam:"红队",
};

export async function seedContextFixture(data) {
  const c = contextFixture;
  const records = {
    library:{ currentId:c.seriesId, series:[{ id:c.seriesId, name:c.seriesName, teams:[
      { id:c.blueId, name:c.blueTeam, players:[] }, { id:c.redId, name:c.redTeam, players:[] },
    ] }] },
    matches:{ games:{ [c.seriesId]:[] } },
    bracket:{ [c.seriesId]:{ draw:[{ a:c.blueId, b:c.redId }], score:{}, win:{} } },
  };
  await Promise.all(Object.entries(records).map(([key, value]) =>
    fs.writeFile(path.join(data, key + ".json"), JSON.stringify(value))));
}
