import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { contextFixture as ctx, launchBrowser, seedContextFixture, startTestServer } from "./browser-test-fixture.mjs";

// Browser (playwright) smoke test with private data and a system-assigned port.
const data = await fs.mkdtemp(path.join(os.tmpdir(), "pkc-context-smoke-"));
let server;
let browser;
try {
  await seedContextFixture(data);
  server = await startTestServer(data);
  const API = server.url;
  const contextResponse = await fetch(API + "/api/director/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ctx),
  });
  if (!contextResponse.ok) throw new Error("设置测试上下文失败：" + await contextResponse.text());

  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  await page.route("**/api/store/**", (r) =>
    r.request().method() === "POST" ? r.abort() : r.continue());
  await page.goto(API + "/director", { waitUntil: "load" });
  await page.waitForFunction(() => window.__pkDirectorReady, null, { timeout: 20000 });
  await page.waitForFunction(
    (blue) => document.querySelector("#ivBlue") && document.querySelector("#ivBlue").value === blue,
    ctx.blueTeam,
    { timeout: 8000 },
  );
  const out = await page.evaluate(() => ({
    chip: document.querySelector("#ctxChip").textContent,
    follow: document.querySelector("#ivFollow").checked,
    blue: document.querySelector("#ivBlue").value,
    red: document.querySelector("#ivRed").value,
  }));
  console.log(JSON.stringify(out, null, 2));

  if (!out.chip.includes("16强1")) throw new Error("顶部上下文条未显示场次");
  if (!out.follow) throw new Error("赛间板跟随开关默认应为开");
  if (out.blue !== ctx.blueTeam || out.red !== ctx.redTeam) throw new Error("赛间板未跟随上下文");
  for (const width of [760, 761, 999, 1000, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height:1050 });
    const layout = await page.evaluate(() => {
      const monitor = document.querySelector("#view-director .stage").getBoundingClientRect();
      const editor = document.querySelector("#view-director .ops").getBoundingClientRect();
      const push = document.querySelector("#btnPush").getBoundingClientRect();
      return {
        sideBySide:editor.left >= monitor.right && Math.abs(editor.top - monitor.top) < 2,
        stacked:editor.top >= monitor.bottom,
        pushVisible:push.width > 0 && push.left >= 0 && push.right <= innerWidth,
        overflow:document.documentElement.scrollWidth > innerWidth,
      };
    });
    if (width >= 1000 ? !layout.sideBySide : !layout.stacked) throw new Error("导播排版断点错误：" + width);
    if (layout.overflow || !layout.pushVisible) throw new Error("导播横向溢出或推送不可达：" + width);
  }
} finally {
  try { await browser?.close(); }
  finally {
    await server?.stop();
    await fs.rm(data, { recursive:true, force:true });
  }
}
