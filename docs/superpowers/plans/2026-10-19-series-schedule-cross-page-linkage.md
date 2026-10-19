# 系列赛赛程跨页面联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让赛程图、队伍库、对局数据、导播台和 OBS 围绕同一个“当前场次 + 当前局”联动，并消除同一份数据多处可写的混乱。

**Architecture:** 以 `bracket` 的稳定场次键（`R16-1`、`WB1-1`、`GF` 等）作为场次身份，以局对象的 `matchKey` 建立“单局战绩 → 赛程场次”的唯一连接；生成器把当前上下文发布到 `数据/context.json` 和导播台 `live.context`，导播台与 OBS 只消费、不复制战绩。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js 24（`node:http`、`node:fs`）、现有 `bp-core` 零依赖状态机、Playwright（仅测试）、现有 SSE 状态流。

**Spec:** `docs/superpowers/specs/2026-10-19-series-schedule-cross-page-linkage-design.md`

## Global Constraints

- 不清理、不覆盖 `数据/library.json`、`数据/bracket.json`、`数据/matches.json` 的现有内容；当前 30 支队伍、4 组分组、16 强抽签和 `赢不了也输不起 vs 别让我取名` 的局数据必须保留。
- 没有 `matchKey` 的历史局一律归入“未关联赛程”，不得自动改写 `label`、队伍或战绩。
- 不自动推进淘汰赛对阵；只有操作者点击 `回填` 并确认后，才允许写 `bracket.score` / `bracket.win`。
- 不暴露、复制或写入 DeepSeek API Key；本计划不修改 `数据/ai-config.json`。
- 临时文件放在新建的 `tmp/<任务名>-<日期>/` 目录；最终文档放 `docs/`。
- `director/console.html` 是当前唯一在用的导播台源文件。`tools/build-console.mjs` 基于旧的 `director/director.html`，运行会覆盖现有赛间板/数据图/BP 操作台；**不要运行它**。
- 页面文案用中文；代码标识符用英文；所有新增函数保持现有 `function name(){}` 风格。
- 本目录不是 Git 仓库，计划中的“提交”步骤统一替换为“运行验证并记录结果”。
- 生成器测试在 `page.evaluate()` 开头把 `s.games` 重置为 `[window.PKC.newGame("第1局", "")]`，
  避免上一次测试留下的 `matchKey` 局影响断言；测试已拦截所有写接口，不会污染磁盘数据。

## 执行状态（2026-10-19）

Task 1–9 已实现并通过回归。实际落地与计划的两处偏差：

1. `publishContext()` 除了 POST 给导播台，还直接 `STORE.save("context", ctx)`。原因是 `saveAll()`
   只在数据改动时触发，单纯刷新页面不会写盘；不直接保存的话，重启服务后 `context.json` 可能还是旧值。
2. 回归时发现 `数据/matches.json` 混进了两条局记录（一条队伍 ID 已失效，一条是早前识别乱码版本）。
   已恢复为单局 `赢不了也输不起 vs 别让我取名`、`3:14`、`10:44`，并按用户指出的
   敖隐/虞姬=发育路、刘邦/东皇太一=上单、海月/西施=中路、铠/元流之子=打野、张飞/姜子牙=游走
   修正分路。损坏版本备份在 `tmp/backup-20261019-linkage/matches-corrupted-before-restore.json`。

验证命令与结果：

```text
node tools/test-context-model.mjs        PASS
node tools/test-match-ui.mjs             PASS
node tools/test-bracket-link.mjs         PASS
node tools/test-team-source.mjs          PASS
node tools/test-team-status.mjs          PASS
node tools/test-console-context.mjs      PASS
node tools/test-obs-context.mjs          PASS
node tools/test-obs-scenes.mjs           PASS
node tools/test-export-scope.mjs         PASS
node tools/test-schedule-regression.mjs  PASS
node tools/check-console.mjs             PASS（3 个脚本块，0 抛错，无全局名冲突）
node bp-core/test/store.test.js          PASS（14/14）
node tools/test-hero-lanes.mjs           PASS
node tools/test-ocr-tools.mjs            PASS（10/10）
node tools/verify-app.mjs                PASS（无 pageerror，预览与全尺寸导出正常）
node tools/verify-kpl-style.mjs          PASS
```

### 追加交互（2026-10-19）

- `①` 绑定赛程场次后，蓝/红方下拉只保留该场次的两支队伍；未关联赛程时仍显示全队。
- `＋ 本场新一局` 默认与上一局互换红蓝方，并在切到新局时同步下拉。
- “本局信息”卡头新增醒目的 `⇄ 交换红蓝方` 按钮；OCR 卡片里的旧按钮也改成同样的主按钮样式。
- 新增 `tools/test-match-sides.mjs` 覆盖以上三点，已 PASS。
- 人工截图验收时误点出一条 `R16-1` 测试局，已从 `数据/matches.json` 删除，恢复为单局
  `kp1vmgc`；损坏版本仍保留在 `tmp/backup-20261019-linkage/` 下。

---

## File Structure

| 文件 | 职责 | 本计划中的改动 |
| --- | --- | --- |
| `assets/chart-core.js` | 生成器的数据模型、赛程图、对局表格、导出 | 增加 `matchKey`、场次选择器、赛程联动、上下文发布、队伍来源单一化、状态推导 |
| `PKC赛后数据图生成器.html` | 生成器页面骨架与样式 | 增加赛程场次下拉、队伍下拉、赛程行按钮样式 |
| `server.mjs` | 本地 HTTP 服务与 `/api/store/*` | `context` 加入可持久化键 |
| `bp-core/src/store.js` | 导播台预览/在播/现场三层状态 | `live.context` 与 `setContext()` |
| `director/routes.mjs` | 导播台路由与 API | `/api/director/context`、启动时恢复上下文 |
| `director/console.html` | 导播台唯一源文件 | 上下文条、赛间板跟随、BP 队名优先级、数据图状态 |
| `director/obs.html` | OBS 场景页 | 赛程图高亮、BP/阵容/赛间/数据图上下文标识 |
| `tools/test-*.mjs` | 自动化验证 | 新增 10 个联动测试脚本 |
| `使用说明.md` | 操作手册 | 增加“赛程图 ↔ 对局数据”一节 |

---

## Task 1: 数据模型与上下文协议

**Files:**
- Modify: `assets/chart-core.js` — `newGame()`、`normGame()`、`saveAll()`、`window.PKC` 导出
- Modify: `server.mjs:257` — `STORE_KEYS`
- Modify: `bp-core/src/store.js` — `initialLive()`、新增 `setContext()`、返回对象
- Modify: `director/routes.mjs` — 新增 `context` 动作、启动时恢复 `数据/context.json`
- Test: `tools/test-context-model.mjs`
- Test: `bp-core/test/store.test.js`

**Interfaces:**
- Produces: `newGame(label, matchKey) -> game`
- Produces: `normGame(g, i)` 保留 `g.matchKey`
- Produces: `contextSnapshot() -> context | null`
- Produces: `publishContext(delay) -> void`
- Produces: `store.setContext(ctx) -> snapshot`
- Produces: `POST /api/director/context` 接受上下文对象本身

- [ ] **Step 1: 写模型层失败测试**

Create `tools/test-context-model.mjs`:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route("**/api/store/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.route("**/api/director/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const g = window.PKC.game();
  const ng = window.PKC.normGame({ id: "t1", label: "第1局", matchKey: "R16-5", rows: [] }, 0);
  const ng2 = window.PKC.newGame("第2局", "R16-5");
  const ctx = window.PKC.contextSnapshot();
  return {
    gameHasMatchKey: Object.prototype.hasOwnProperty.call(g, "matchKey"),
    normMatchKey: ng.matchKey,
    newMatchKey: ng2.matchKey,
    newLabel: ng2.label,
    ctxHasMatchKey: !!(ctx && Object.prototype.hasOwnProperty.call(ctx, "matchKey")),
    ctxSeriesId: ctx && ctx.seriesId,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (!out.gameHasMatchKey) throw new Error("game 缺少 matchKey");
if (out.normMatchKey !== "R16-5") throw new Error("normGame 未保留 matchKey");
if (out.newMatchKey !== "R16-5" || out.newLabel !== "第2局") throw new Error("newGame 参数错误");
if (!out.ctxHasMatchKey || !out.ctxSeriesId) throw new Error("contextSnapshot 不完整");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-context-model.mjs`
Expected: FAIL，报 `window.PKC.normGame is not a function` 或 `game 缺少 matchKey`。

- [ ] **Step 3: 给局对象加 `matchKey`**

In `assets/chart-core.js`, replace `newGame()`:

```js
function newGame(label, matchKey){
  return { id:uid(), label:label||"第1局", matchKey:matchKey||"", ourId:"", oppId:"",
           ourScore:"", oppScore:"", result:"win", date:"", duration:"",
           dmgBlue:"", dmgRed:"", rows:emptyRows() };
}
```

In `normGame()`, add `matchKey` right after `label`:

```js
function normGame(g, i){
  return { id:g.id||uid(), label:g.label||("第"+(i+1)+"局"),
           matchKey:String(g.matchKey||""),
           ourId:g.ourId||"", oppId:g.oppId||"",
           ourScore:g.ourScore===undefined?"":String(g.ourScore), oppScore:g.oppScore===undefined?"":String(g.oppScore),
           result:g.result||"win", date:g.date||"", duration:g.duration||"",
           dmgBlue:g.dmgBlue===undefined?"":String(g.dmgBlue), dmgRed:g.dmgRed===undefined?"":String(g.dmgRed),
           rows:POSITIONS.map((p,j)=>{
             const raw = (g.rows && g.rows[j]) || {};
             return { pos: (raw.pos===undefined ? p : String(raw.pos||"")),
                      posOpp: (raw.posOpp===undefined ? (raw.pos===undefined ? p : String(raw.pos||"")) : String(raw.posOpp||"")),
                      our:normPlayer(raw.our), opp:normPlayer(raw.opp) };
           }) };
}
```

- [ ] **Step 4: 增加上下文快照与发布**

In `assets/chart-core.js`, insert immediately after `saveAll()`:

```js
/* ---------- 当前场次上下文（生成器 → 导播台 / OBS） ---------- */
function contextSnapshot(){
  const s = S.series, g = s && S.game;
  if (!s || !g) return null;
  const teams = s.teams || [];
  const nameOf = id => (teams.find(t => t.id === id) || {}).name || "";
  const m = (g.matchKey && typeof bkMatchByKey === "function") ? bkMatchByKey(g.matchKey) : null;
  return {
    seriesId: s.id,
    seriesName: s.name || "",
    matchKey: g.matchKey || "",
    matchLabel: m ? (m.code + " · " + nameOf(m.a) + " vs " + nameOf(m.b)) : "",
    matchRound: m ? ((BK_ROUNDS[m.round] || {}).name || "") : "",
    gameId: g.id || "",
    gameLabel: g.label || "",
    blueId: g.ourId || "",
    redId: g.oppId || "",
    blueTeam: nameOf(g.ourId),
    redTeam: nameOf(g.oppId),
    updatedAt: new Date().toISOString(),
  };
}

let ctxTimer = null;
function publishContext(delay){
  clearTimeout(ctxTimer);
  const send = () => {
    const ctx = contextSnapshot();
    if (!ctx) return;
    fetch("/api/director/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
    }).catch(() => {});
  };
  if (delay) ctxTimer = setTimeout(send, delay);
  else send();
}
```

In `saveAll()`, after the `heroPick` save, add:

```js
  await STORE.save("context", contextSnapshot());
```

- [ ] **Step 5: 导出模型函数**

In the `window.PKC = { ... }` object near the end of `assets/chart-core.js`, add:

```js
    normGame, newGame, contextSnapshot, publishContext,
```

- [ ] **Step 6: 服务端持久化 `context`**

In `server.mjs:257`, replace `STORE_KEYS`:

```js
const STORE_KEYS = new Set(["library", "matches", "prefs", "heroPick", "bracket", "context"]);
```

- [ ] **Step 7: 导播台状态增加 `live.context`**

In `bp-core/src/store.js`, add `context: null` to `initialLive()`:

```js
    bracket: null,
    bracketChange: null,
    context: null,       // 当前系列赛 / 场次 / 局（由生成器发布）
    revision: 0,
```

Add `setContext()` after `setBracket()`:

```js
  /** 写入当前场次上下文。上下文是现场指针，直接进 live，不经过预览推送。 */
  function setContext(ctx) {
    live.context = ctx ? JSON.parse(JSON.stringify(ctx)) : null;
    live.revision += 1;
    notify('live');
    return snapshot();
  }
```

Add `setContext` to the returned object:

```js
    setBracket,
    replayBracket,
    setContext,
    subscribe,
```

- [ ] **Step 8: 导播台 API 接收上下文**

In `director/routes.mjs`, add the endpoint to the header comment:

```js
 *   POST /api/director/context      { seriesId, matchKey, gameId, ... }  现场通道
```

Add a `case` before `case 'bracket':`:

```js
      case 'context':
        store.setContext(body.context || body);
        break;
```

At the bottom, after `seedBracketFromDisk();`, add:

```js
function seedContextFromDisk() {
  const ctx = readJsonSafe(path.join(ROOT, '数据', 'context.json'));
  if (ctx && ctx.seriesId) store.setContext(ctx);
}
seedContextFromDisk();
```

- [ ] **Step 9: 给 store 加单元测试**

Append to `bp-core/test/store.test.js`:

```js
test('context 走现场通道，订阅者能收到', () => {
  const s = createStore();
  let got = null;
  s.subscribe((p) => { if (p.channel === 'live') got = p.state.live.context; });
  s.setContext({ seriesId: 's1', matchKey: 'R16-5', gameId: 'g1' });
  assert.equal(s.snapshot().live.context.matchKey, 'R16-5');
  assert.equal(got.matchKey, 'R16-5');
  s.setContext(null);
  assert.equal(s.snapshot().live.context, null);
});
```

- [ ] **Step 10: 运行模型与 store 测试**

Run: `node tools/test-context-model.mjs`
Expected: PASS，输出 `gameHasMatchKey: true`、`normMatchKey: "R16-5"`、`ctxHasMatchKey: true`。

Run: `node --test bp-core/test/store.test.js`
Expected: PASS，包含 `context 走现场通道，订阅者能收到`。

- [ ] **Step 11: 验证接口**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:8971/api/ping
```

Expected: `200 {"ok":true,...}`。若服务未启动，先运行 `node server.mjs`，并保持窗口打开。

Task 1 改了 `server.mjs`、`director/routes.mjs` 和 `bp-core/src/store.js`，必须重启本地服务才会生效：
关闭旧的 `node server.mjs` 窗口，重新运行 `node server.mjs`（或双击 `启动.bat`），再执行上面的 `ping`。

---

## Task 2: ① 赛程场次选择器与局过滤

**Files:**
- Modify: `PKC赛后数据图生成器.html:222` — 在 `#gameBar` 前插入 `#matchBar` 和 `#matchWarn`
- Modify: `assets/chart-core.js` — `renderGameBar()`、新增 `renderMatchBar()`、`gamesOfMatch()`、`openMatch()`、`init()`
- Test: `tools/test-match-ui.mjs`

**Interfaces:**
- Consumes: `newGame(label, matchKey)`、`contextSnapshot()`（Task 1）
- Produces: `bkSelectableMatches() -> match[]`
- Produces: `gamesOfMatch(matchKey) -> [{ game, index }]`
- Produces: `openMatch(matchKey) -> game | null`
- Produces: `renderMatchBar() -> void`

- [ ] **Step 1: 写页面测试**

Create `tools/test-match-ui.mjs`:

```js
import { createRequire } from "node:module";
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
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const t = s.teams;
  const a = t[0].id, b = t[1].id;
  const br = window.PKC.bracket();
  br.draw[4] = { a, b };                       // R16-5
  const before = s.games.length;
  const g1 = window.PKC.openMatch("R16-5");
  const after1 = s.games.length;
  const g2 = window.PKC.newGame("第2局", "R16-5");
  s.games.push(g2);
  s.current = s.games.length - 1;
  window.PKC.renderGameBar();
  return {
    before,
    after1,
    key1: g1 && g1.matchKey,
    blue1: g1 && g1.ourId,
    red1: g1 && g1.oppId,
    label1: g1 && g1.label,
    chipCount: document.querySelectorAll("#gameBar .mini.primary").length,
    matchOptions: document.querySelector("#selMatch").options.length,
    selected: document.querySelector("#selMatch").value,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.after1 !== out.before + 1) throw new Error("openMatch 未新建局");
if (out.key1 !== "R16-5" || out.blue1 === "" || out.red1 === "") throw new Error("新局未带入赛程队伍");
if (out.label1 !== "第1局") throw new Error("新局标签不是第1局");
if (out.selected !== "R16-5") throw new Error("场次下拉未选中 R16-5");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-match-ui.mjs`
Expected: FAIL，报 `window.PKC.openMatch is not a function` 或找不到 `#selMatch`。

- [ ] **Step 3: 插入页面骨架**

In `PKC赛后数据图生成器.html`, directly before `<div class="row" id="gameBar"...>`:

```html
            <div class="row" id="matchBar" style="margin-bottom:8px;align-items:center">
              <div class="fld" style="flex:1;min-width:260px"><label>赛程场次</label><select id="selMatch"></select></div>
              <button class="mini" id="btnMatchData" title="用当前赛程场次新建一局">＋ 本场新一局</button>
            </div>
            <div id="matchWarn" class="notice warn" style="display:none;margin-bottom:8px"></div>
```

- [ ] **Step 4: 增加场次索引与选择器**

In `assets/chart-core.js`, insert before `renderGameBar()`:

```js
/* ---------- 赛程场次索引 ---------- */
function bkMatchList(){
  return bkTree().list.map(m => ({ ...m, ready: !!(m.a && m.b) }));
}
function bkMatchByKey(key){
  if (!key) return null;
  return bkTree().map[key] || null;
}
function bkSelectableMatches(){
  const withGames = new Set(S.series.games.map(g => g.matchKey).filter(Boolean));
  return bkMatchList().filter(m => (m.a && m.b) || withGames.has(m.key));
}
function gamesOfMatch(key){
  return S.series.games.map((g, i) => ({ game: g, index: i }))
    .filter(x => (x.game.matchKey || "") === (key || ""));
}
function renderMatchBar(){
  const sel = $("#selMatch");
  if (!sel) return;
  const cur = S.game ? (S.game.matchKey || "") : "";
  const list = bkSelectableMatches();
  const byRound = {};
  list.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
  const loose = S.series.games.filter(g => !(g.matchKey || "")).length;
  let html = '<option value="">未关联赛程' + (loose ? '（' + loose + ' 局）' : '') + '</option>';
  BK_ORDER.forEach(rd => {
    const arr = byRound[rd];
    if (!arr || !arr.length) return;
    html += '<optgroup label="' + esc(BK_ROUNDS[rd].name) + '">';
    arr.forEach(m => {
      const n = gamesOfMatch(m.key).length;
      html += '<option value="' + m.key + '">'
        + esc(m.code + " · " + bkTeamName(m.a) + " vs " + bkTeamName(m.b))
        + (n ? "（已录 " + n + " 局）" : "") + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
  sel.value = cur;
  const add = $("#btnMatchData");
  if (add) add.disabled = !cur;
}
function matchTeamMismatch(key, g){
  const m = bkMatchByKey(key);
  if (!m || !g || !m.a || !m.b) return "";
  const ids = [g.ourId, g.oppId].filter(Boolean);
  if (!ids.length) return "";
  if (ids.length === 2 && ids.every(id => id === m.a || id === m.b)) return "";
  return "赛程是 " + bkTeamName(m.a) + " vs " + bkTeamName(m.b)
    + "，这局录的是 " + (bkTeamName(g.ourId) || "未选") + " vs " + (bkTeamName(g.oppId) || "未选");
}
function renderMatchWarn(){
  const el = $("#matchWarn");
  if (!el) return;
  const msg = S.game ? matchTeamMismatch(S.game.matchKey || "", S.game) : "";
  el.textContent = msg ? "⚠ " + msg + "；不会自动改任何一边。" : "";
  el.style.display = msg ? "" : "none";
}
function openMatch(key){
  const m = bkMatchByKey(key);
  if (!m) { toast("找不到这场赛程"); return null; }
  const list = gamesOfMatch(key);
  if (list.length){
    S.series.current = list[list.length - 1].index;
  } else {
    const g = newGame("第1局", key);
    if (m.a) g.ourId = m.a;
    if (m.b) g.oppId = m.b;
    S.series.games.push(g);
    S.series.current = S.series.games.length - 1;
  }
  switchTab("data");
  renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview(); renderMgInfo();
  publishContext(0);
  scheduleSave();
  return S.game;
}
```

- [ ] **Step 5: 按场次过滤局按钮**

Replace `renderGameBar()` with:

```js
function renderGameBar(){
  renderMatchBar();
  const s = S.series, bar = $("#gameBar");
  const key = S.game ? (S.game.matchKey || "") : "";
  const list = s.games.map((g, i) => ({ g, i })).filter(x => (x.g.matchKey || "") === key);
  bar.innerHTML = "";
  list.forEach(({ g, i }) => {
    const b = document.createElement("button");
    b.className = "mini" + (i === s.current ? " primary" : "");
    b.textContent = g.label;
    b.onclick = () => {
      s.current = i;
      renderGameBar(); renderGameForm(); renderTables(); renderPreview();
      renderMatchWarn(); publishContext(0);
    };
    bar.appendChild(b);
  });
  const add = document.createElement("button");
  add.className = "mini"; add.textContent = "＋ 本场新一局";
  add.onclick = () => {
    s.games.push(newGame("第" + (list.length + 1) + "局", key));
    s.current = s.games.length - 1;
    renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview();
    publishContext(0); scheduleSave();
  };
  bar.appendChild(add);
  if (list.length > 1){
    const del = document.createElement("button");
    del.className = "mini"; del.textContent = "删除本局";
    del.onclick = () => {
      if (!confirm("删除「" + S.game.label + "」？")) return;
      s.games.splice(s.current, 1);
      s.current = clamp(s.current, 0, s.games.length - 1);
      renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview();
      publishContext(0); scheduleSave();
    };
    bar.appendChild(del);
  }
  const m = S.game.matchKey ? bkMatchByKey(S.game.matchKey) : null;
  $("#gameHint").textContent = s.games.length + " 局已录入 · "
    + (m ? m.code + " · " : "") + "本场 " + list.length + " 局 · 当前 " + S.game.label;
  renderMatchWarn();
}
```

- [ ] **Step 6: 绑定选择器**

In `init()`, after the tab bindings and before `$("#selSeries").onchange`, add:

```js
  $("#selMatch").onchange = () => {
    const key = $("#selMatch").value;
    if (key) { openMatch(key); return; }
    let idx = S.series.games.findIndex(g => !(g.matchKey || ""));
    if (idx < 0){
      S.series.games.push(newGame("第" + (S.series.games.length + 1) + "局", ""));
      idx = S.series.games.length - 1;
    }
    S.series.current = idx;
    renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview(); renderMgInfo();
    publishContext(0); scheduleSave();
  };
  $("#btnMatchData").onclick = () => {
    const key = $("#selMatch").value;
    if (!key) return toast("先在⑤赛程图里给这场排好两支队伍");
    openMatch(key);
  };
```

In `init()` after `renderSeriesSelect();`, add `renderMatchBar();` before `renderGameBar();`.

In `$("#selSeries").onchange`, append `renderMatchBar(); publishContext(0);` to the existing chain.

At the very end of `init()` (after the initial `buildPreview(); renderPreview();`), add:

```js
  publishContext(0);
```

这样刷新生成器、或 OBS 先于生成器打开时，`数据/context.json` 和导播台都会拿到当前真实场次，
不会停在测试或上一场的上下文。

- [ ] **Step 7: 刷新后恢复上次场次与局**

In `loadAll()` in `assets/chart-core.js`, add `context` to the `Promise.all`:

```js
  const [lib, mt, pf, hp, br, ctx] = await Promise.all([
    STORE.load("library"), STORE.load("matches"), STORE.load("prefs"),
    STORE.load("heroPick"), STORE.load("bracket"), STORE.load("context")
  ]);
```

Replace the final `DB.currentId = ...` line with:

```js
  const ctxSeries = ctx && ctx.seriesId ? DB.series.find(s => s.id === ctx.seriesId) : null;
  DB.currentId = ctxSeries ? ctxSeries.id
    : ((lib && lib.currentId && DB.series.some(s => s.id === lib.currentId)) ? lib.currentId : DB.series[0].id);
  const cur = DB.series.find(s => s.id === DB.currentId);
  if (cur && ctx) {
    let i = ctx.gameId ? cur.games.findIndex(g => g.id === ctx.gameId) : -1;
    if (i < 0 && ctx.matchKey) {
      const list = cur.games.map((g, k) => ({ g, k }))
        .filter(x => (x.g.matchKey || "") === ctx.matchKey);
      if (list.length) i = list[list.length - 1].k;
    }
    if (i >= 0) cur.current = i;
  }
```

这样刷新生成器后会回到上次的系列赛、场次和局；如果那一局已被删除，就回到同场次的最后一局；
如果场次也没了，再退回 `library.currentId`。

- [ ] **Step 8: 导出联动函数**

In `window.PKC`, add:

```js
    bkSelectableMatches, gamesOfMatch, openMatch, renderMatchBar, renderGameBar, matchTeamMismatch,
```

- [ ] **Step 9: 运行页面测试**

Run: `node tools/test-match-ui.mjs`
Expected: PASS，`after1 = before + 1`、`key1 = "R16-5"`、`label1 = "第1局"`、`selected = "R16-5"`。

---

## Task 3: ⑤ 录数据、局分统计与回填

**Files:**
- Modify: `assets/chart-core.js` — 新增 `matchRecord()`、`bkLinkIssues()`、`renderBkLinkWarn()`；改 `renderBkMatches()`、`renderBracket()`
- Modify: `PKC赛后数据图生成器.html` — `#bkLinkWarn` 与行内按钮样式
- Test: `tools/test-bracket-link.mjs`

**Interfaces:**
- Consumes: `gamesOfMatch()`、`openMatch()`（Task 2）
- Consumes: `bkMatchList()`、`bkMatchByKey()`（Task 2）
- Produces: `matchRecord(key) -> { games, a, b }`
- Produces: `bkLinkIssues() -> issue[]`

- [ ] **Step 1: 写赛程联动测试**

Create `tools/test-bracket-link.mjs`:

```js
import { createRequire } from "node:module";
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
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const a = s.teams[0].id, b = s.teams[1].id;
  window.PKC.bracket().draw[4] = { a, b };
  const g1 = window.PKC.openMatch("R16-5");
  g1.ourId = a; g1.oppId = b; g1.result = "win"; g1.ourScore = "12"; g1.oppScore = "8";
  const g2 = window.PKC.newGame("第2局", "R16-5");
  g2.ourId = a; g2.oppId = b; g2.result = "lose"; g2.ourScore = "7"; g2.oppScore = "10";
  s.games.push(g2); s.current = s.games.length - 1;
  window.PKC.renderBracket();
  return {
    rec: window.PKC.matchRecord("R16-5"),
    list: window.PKC.bkMatchList().length,
    hasRowButton: !!document.querySelector('.bk-data[data-k="R16-5"]'),
    hasSync: !!document.querySelector('.bk-sync[data-k="R16-5"]'),
    issues: window.PKC.bkLinkIssues().length,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.rec.games !== 2 || out.rec.a !== 1 || out.rec.b !== 1) throw new Error("matchRecord 统计错误");
if (!out.hasRowButton || !out.hasSync) throw new Error("赛程行缺少录数据/回填按钮");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-bracket-link.mjs`
Expected: FAIL，报 `window.PKC.matchRecord is not a function`。

- [ ] **Step 3: 增加局分统计与关联检查**

In `assets/chart-core.js`, insert before `renderBkMatches()`:

```js
function matchRecord(key){
  const m = bkMatchByKey(key);
  const gs = gamesOfMatch(key).map(x => x.game);
  let a = 0, b = 0;
  gs.forEach(g => {
    const winner = g.result === "win" ? g.ourId : (g.result === "lose" ? g.oppId : "");
    if (m && winner && winner === m.a) a += 1;
    else if (m && winner && winner === m.b) b += 1;
  });
  return { games: gs.length, a, b };
}
function bkLinkIssues(){
  const out = [];
  const seen = new Set();
  S.series.games.forEach(g => {
    const key = g.matchKey || "";
    if (!key) return;
    const m = bkMatchByKey(key);
    if (!m){
      out.push({ kind: "orphan", key, text: "「" + g.label + "」关联的场次 " + key + " 已不在赛程里" });
      return;
    }
    const msg = matchTeamMismatch(key, g);
    const sig = key + "|" + msg;
    if (msg && !seen.has(sig)){
      seen.add(sig);
      out.push({ kind: "team", key, text: "「" + m.code + "」" + msg });
    }
  });
  return out;
}
function renderBkLinkWarn(){
  const host = $("#bkLinkWarn");
  if (!host) return;
  const issues = bkLinkIssues();
  host.innerHTML = issues.map(i => '<div class="notice bad">⚠ ' + esc(i.text) + '</div>').join("");
  host.style.display = issues.length ? "" : "none";
}
```

- [ ] **Step 4: 在赛程行加按钮**

In `renderBkMatches()`, inside `arr.forEach(m => {`, after `const sc = ...`, add:

```js
      const rec = matchRecord(m.key);
```

Replace the final part of the row HTML:

```js
        + cell("b")
        + '<button class="mini bk-data" data-k="' + m.key + '" ' + (m.a && m.b ? "" : "disabled")
        + ' title="录入/查看这场赛后数据">📊</button>'
        + '<button class="mini bk-sync" data-k="' + m.key + '" ' + (rec.games ? "" : "disabled")
        + ' title="用已录局分回填大比分">回填</button>'
        + (rec.games ? '<span class="bk-rec">' + rec.games + ' 局 ' + rec.a + ':' + rec.b + '</span>' : '')
        + '<button class="mini bk-clr" data-k="' + m.key + '" title="清空这场">↺</button>'
        + '</div>';
```

Note: the original line already ends with the clear button and `</div>`; replace that whole block so the clear button stays last.

- [ ] **Step 5: 绑定录数据与回填**

After the existing `$$(".bk-clr", host).forEach(...)`, add:

```js
  $$(".bk-data", host).forEach(el => {
    el.onclick = () => { openMatch(el.dataset.k); };
  });
  $$(".bk-sync", host).forEach(el => {
    el.onclick = () => {
      const k = el.dataset.k, rec = matchRecord(k), m = bkMatchByKey(k);
      if (!rec.games || !m) return;
      const winner = rec.a === rec.b ? "" : bkTeamName(rec.a > rec.b ? m.a : m.b);
      const ok = confirm("用这场已录的 " + rec.games + " 局把比分填成 " + rec.a + " : " + rec.b + "？"
        + (winner ? "\n并把「" + winner + "」标记为晋级。" : "\n平局只填比分，不标记晋级。"));
      if (!ok) return;
      const b2 = B();
      b2.score[k] = { a: String(rec.a), b: String(rec.b) };
      if (rec.a !== rec.b) b2.win[k] = rec.a > rec.b ? "a" : "b";
      renderBracket(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind: "win", key: k, side: b2.win[k] || "a" });
    };
  });
  renderBkLinkWarn();
```

- [ ] **Step 6: 增加提示区与样式**

In `PKC赛后数据图生成器.html`, after `<div id="bkDrawWarn"></div>`, add:

```html
              <div id="bkLinkWarn" style="display:none"></div>
```

Add to the `<style>` block:

```css
  .bk-rec{font-size:11px;color:#8a6a12;background:#fff7dd;border:1px solid #f0dca0;border-radius:6px;padding:1px 6px;margin-left:2px;white-space:nowrap}
  .bk-data,.bk-sync{padding:2px 6px}
```

- [ ] **Step 7: 渲染关联冲突提示**

In `renderBracket()`, at the end add `renderBkLinkWarn();`.

`bracketLiveSnapshot()` 不增加 `activeMatchKey`。OBS 的当前场次高亮统一从
`live.context.matchKey` 读取（Task 7），避免赛程快照和上下文各存一份指针。

- [ ] **Step 8: 导出函数**

In `window.PKC`, add:

```js
    bkMatchList, bkMatchByKey, matchRecord, bkLinkIssues, renderBracket,
```

- [ ] **Step 9: 运行测试**

Run: `node tools/test-bracket-link.mjs`
Expected: PASS，`rec = { games: 2, a: 1, b: 1 }`，`hasRowButton/hasSync = true`，`issues = 0`。

---

## Task 4: ① 队伍来源单一化

**Files:**
- Modify: `PKC赛后数据图生成器.html:224-226` — 队名输入框改为下拉
- Modify: `assets/chart-core.js` — 删除 `fillTeamDL()`、`commitTeamName()`、`commitTeamInput()`；新增 `fillTeamSelects()`；改 `renderGameForm()`、`applySideTeam()`、`init()`
- Test: `tools/test-team-source.mjs`

**Interfaces:**
- Consumes: `S.series.teams`、`applySideTeam(side, id)`
- Produces: `fillTeamSelects() -> void`

- [ ] **Step 1: 写队伍来源测试**

Create `tools/test-team-source.mjs`:

```js
import { createRequire } from "node:module";
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
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const teams = window.PKC.series().teams;
  const target = teams[3];
  const before = teams.length;
  const sel = document.querySelector("#inOurTeam");
  sel.value = target.id;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    tag: sel.tagName,
    optionCount: sel.options.length,
    selected: sel.value,
    gameOurId: window.PKC.game().ourId,
    teamCount: window.PKC.series().teams.length,
    before,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.tag !== "SELECT") throw new Error("队名控件不是下拉");
if (out.gameOurId !== out.selected) throw new Error("选择队伍后未写入 game.ourId");
if (out.teamCount !== out.before) throw new Error("选择队伍不应新建队伍");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-team-source.mjs`
Expected: FAIL，`tag` 为 `INPUT`。

- [ ] **Step 3: 替换页面控件**

Replace the blue and red team `div.fld` blocks in `PKC赛后数据图生成器.html` with:

```html
              <div class="fld" style="width:236px"><label>蓝方队伍（来自队伍库）</label><select id="inOurTeam"></select></div>
              <button class="mini" id="btnOurTeamEdit" title="去②队伍库编辑这支队伍">编辑</button>
              <div class="fld" style="width:86px"><label>蓝方比分</label><input type="text" id="inOurScore"></div>
              <div class="fld" style="width:236px"><label>红方队伍（来自队伍库）</label><select id="inOppTeam"></select></div>
              <button class="mini" id="btnOppTeamEdit" title="去②队伍库编辑这支队伍">编辑</button>
              <div class="fld" style="width:86px"><label>红方比分</label><input type="text" id="inOppScore"></div>
```

- [ ] **Step 4: 增加队伍下拉填充**

Replace `fillTeamDL()` with:

```js
function fillTeamSelects(){
  const opts = '<option value="">— 未选择 —</option>' + S.series.teams
    .filter(t => t.name)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"))
    .map(t => '<option value="' + esc(t.id) + '">' + esc(t.name)
      + (t.eliminated ? "（停用）" : "") + '</option>')
    .join("");
  ["#inOurTeam", "#inOppTeam"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = opts;
  });
}
```

In `renderGameForm()`, replace `fillTeamDL();` with `fillTeamSelects();` and set values by ID:

```js
  fillTeamSelects();
  $("#inOurTeam").value = g.ourId || "";
  $("#inOppTeam").value = g.oppId || "";
  $("#inOurScore").value = g.ourScore;
  $("#inOppScore").value = g.oppScore;
  $("#selResult").value = g.result;
  $("#inDate").value = g.date;
  $("#inDur").value = g.duration || "";
  $("#inDmgBlue").value = g.dmgBlue || "";
  $("#inDmgRed").value = g.dmgRed || "";
  syncTeamDmgPH(g);
  renderMatchWarn();
```

In `applySideTeam()`, replace `fillTeamDL();` with `fillTeamSelects();` and add `renderMatchWarn(); publishContext(0);`.

- [ ] **Step 5: 删除隐式建队/改名**

Delete `commitTeamName()` and `commitTeamInput()` entirely. Confirm no remaining references:

```powershell
rg -n "commitTeamName|commitTeamInput|fillTeamDL" assets/chart-core.js PKC赛后数据图生成器.html
```

Expected: no output.

Delete `<datalist id="teamDL"></datalist>` from `PKC赛后数据图生成器.html`.

- [ ] **Step 6: 改初始化绑定**

Replace the existing team input block in `init()`:

```js
  [["our", "#inOurTeam"], ["opp", "#inOppTeam"]].forEach(([side, sel]) => {
    const el = $(sel);
    if (!el) return;
    el.onchange = () => applySideTeam(side, el.value);
  });
  [["our", "#btnOurTeamEdit"], ["opp", "#btnOppTeamEdit"]].forEach(([side, sel]) => {
    const el = $(sel);
    if (!el) return;
    el.onclick = () => {
      const id = side === "opp" ? S.game.oppId : S.game.ourId;
      const t = S.series.teams.find(x => x.id === id);
      if (!t) return toast("先在①里选一支队伍");
      switchTab("teams");
      editTeam(t);
    };
  });
```

- [ ] **Step 7: 运行测试**

Run: `node tools/test-team-source.mjs`
Expected: PASS，`tag = "SELECT"`、`gameOurId = selected`、`teamCount = before`。

Run: `node tools/test-hero-lanes.mjs`
Expected: PASS，分路匹配不受影响。

---

## Task 5: ② 与 ⑤ 的分组 / 淘汰状态去重

**Files:**
- Modify: `assets/chart-core.js` — 新增 `teamGroupOf()`、`bkTeamStatus()`、`syncTeamGroups()`；改 `renderTeamGrid()`、`bkTeamOptions()`、`bkAutoFill()`、`renderBkGroups()`
- Test: `tools/test-team-status.mjs`

**Interfaces:**
- Produces: `teamGroupOf(teamId) -> "A" | "B" | "C" | "D" | ""`
- Produces: `bkTeamStatus(teamId) -> { state, wins, losses, label }`
- Produces: `syncTeamGroups() -> void`

- [ ] **Step 1: 写状态推导测试**

Create `tools/test-team-status.mjs`:

```js
import { createRequire } from "node:module";
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
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const a = s.teams[0].id, b = s.teams[1].id;
  const br = window.PKC.bracket();
  br.groups.A[0] = a;
  br.draw[0] = { a, b };
  br.win["R16-1"] = "b";                    // b 赢，a 输 → a 淘汰
  window.PKC.syncTeamGroups();
  return {
    groupA: window.PKC.teamGroupOf(a),
    statusA: window.PKC.bkTeamStatus(a),
    statusB: window.PKC.bkTeamStatus(b),
    matchKeyA: window.PKC.bkTeamMatchKey(a),
    teamLabel: s.teams.find(t => t.id === a).group,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.groupA !== "A") throw new Error("teamGroupOf 未从 bracket.groups 推导");
if (out.statusA.state !== "out") throw new Error("16 强输家应标记为已淘汰");
if (out.statusB.wins !== 1) throw new Error("胜者胜场统计错误");
if (out.matchKeyA !== "R16-1") throw new Error("bkTeamMatchKey 未定位到该队场次");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-team-status.mjs`
Expected: FAIL，报 `window.PKC.teamGroupOf is not a function`。

- [ ] **Step 3: 增加分组与状态推导**

In `assets/chart-core.js`, insert before `renderTeamGrid()`:

```js
function teamGroupOf(id){
  if (!id) return "";
  const b = B();
  for (const g of BK_G) {
    if ((b.groups[g] || []).includes(id)) return g;
  }
  return "";
}
function syncTeamGroups(){
  const b = B();
  const map = {};
  BK_G.forEach(g => (b.groups[g] || []).forEach(id => { if (id) map[id] = g; }));
  S.series.teams.forEach(t => { if (map[t.id]) t.group = map[t.id]; });
}
function bkTeamStatus(id){
  if (!id) return { state: "idle", wins: 0, losses: 0, label: "" };
  const T = bkTree();
  const reset = B().win["GF"] === "b";        // 败者组冠军先赢一场 → 还有 GF2
  let wins = 0, losses = 0, decided = false;
  T.list.forEach(m => {
    if (!m.a || !m.b) return;
    const w = B().win[m.key];
    if (w !== "a" && w !== "b") return;
    const winner = w === "a" ? m.a : m.b;
    const loser = w === "a" ? m.b : m.a;
    if (winner === id) wins += 1;
    if (loser === id) {
      losses += 1;
      const finalLoss = m.round === "r16" || m.round === "lbf" || m.round === "gf2"
        || (m.round === "gf" && !reset);
      if (finalLoss) decided = true;
    }
  });
  if (decided || losses >= 2) return { state: "out", wins, losses, label: "已淘汰" };
  if (losses === 1) {
    const inFinal = T.list.some(m => (m.key === "GF" || m.key === "GF2")
      && (m.a === id || m.b === id) && B().win[m.key]);
    return { state: "lower", wins, losses, label: inFinal ? "总决赛" : "败者组" };
  }
  if (wins > 0) return { state: "alive", wins, losses, label: "晋级中" };
  return { state: "idle", wins, losses, label: "" };
}
function bkTeamMatchKey(id){
  const T = bkTree();
  const mine = T.list.filter(m => m.a === id || m.b === id);
  const next = mine.find(m => B().win[m.key] !== "a" && B().win[m.key] !== "b");
  return ((next || mine[mine.length - 1]) || {}).key || "";
}
```

`syncTeamGroups()` 只覆盖已经排进分组表的队伍，不清空未排队的 `t.group`。这样抽签进行到一半时，
不会把导入名单里的初始分组全部冲掉。

- [ ] **Step 4: 队伍库改为只读显示分组 / 赛程状态**

In `renderTeamGrid()`, replace the filter block:

```js
  const activeOf = t => !t.eliminated && bkTeamStatus(t.id).state !== "out";
  if (f === "alive") list = list.filter(activeOf);
  if (f === "out") list = list.filter(t => bkTeamStatus(t.id).state === "out");
```

Replace the card meta line:

```js
    const group = teamGroupOf(t.id) || t.group || "";
    const status = bkTeamStatus(t.id);
    el.className = "team" + ((t.eliminated || status.state === "out") ? " out" : "");
    el.innerHTML =
      '<i class="dot" style="background:' + t.color + '"></i>' +
      '<div style="min-width:0"><div class="nm">' + esc(t.name || "(未命名)") + '</div>' +
      '<div class="sm">选手 ' + rosterN + '/5' + (subN ? ' · 替补 ' + subN : "")
      + (group ? ' · ' + esc(group) + ' 组' : "")
      + (status.label ? ' · <span class="tag ' + (status.state === "out" ? "out" : "in") + '">' + esc(status.label) + '</span>' : "")
      + (t.eliminated ? ' <span class="tag out">已停用</span>' : "") + '</div></div>' +
      '<div class="ops"></div>';
```

Replace the manual button:

```js
    mk(t.eliminated ? "启用" : "停用", "", (e) => {
      e.stopPropagation();
      t.eliminated = !t.eliminated;
      renderTeamGrid(); renderGameForm(); bkOnTeamsChanged(); scheduleSave();
    });
    mk("赛程", "", (e) => {
      e.stopPropagation();
      switchTab("bracket");
      const key = bkTeamMatchKey(t.id);
      requestAnimationFrame(() => {
        const hit = key ? document.querySelector('.bk-m [data-k="' + key + '"]') : null;
        const row = hit && hit.closest(".bk-m");
        if (!row) return;
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("bk-flash");
        setTimeout(() => row.classList.remove("bk-flash"), 2200);
      });
    });
```

Add to the `<style>` block:

```css
  .bk-m.bk-flash{animation:bkFlash 2.2s ease}
  @keyframes bkFlash{
    0%,100%{background:transparent}
    18%,62%{background:#fff5cc;box-shadow:0 0 0 2px #f0d37a inset}
  }
```

Replace `teamStat`:

```js
  const total = S.series.teams.length;
  const out = S.series.teams.filter(t => bkTeamStatus(t.id).state === "out").length;
  const stopped = S.series.teams.filter(t => t.eliminated).length;
  $("#teamStat").textContent = total + " 支队伍 · 已淘汰 " + out
    + (stopped ? " · 停用 " + stopped : "");
```

Change the filter labels in `PKC赛后数据图生成器.html`:

```html
<select id="teamFilter"><option value="all">全部队伍</option><option value="alive">参赛中</option><option value="out">已淘汰</option></select>
```

- [ ] **Step 5: 赛程下拉和自动填队使用推导分组**

In `bkTeamOptions()`, replace `t.group` with `(teamGroupOf(t.id) || t.group)`.

In `bkAutoFill()`, replace the team list line:

```js
  const teams = S.series.teams.slice()
    .filter(t => !t.eliminated && bkTeamStatus(t.id).state !== "out")
    .sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "zh"));
```

After filling groups, add `syncTeamGroups();`.

In the group select change handler inside `renderBkGroups()`, after `b.groups[g][i] = sel.value;`, add `syncTeamGroups();`.

- [ ] **Step 6: 导出函数**

In `window.PKC`, add:

```js
    teamGroupOf, bkTeamStatus, bkTeamMatchKey, syncTeamGroups,
```

- [ ] **Step 7: 运行测试**

Run: `node tools/test-team-status.mjs`
Expected: PASS，`groupA = "A"`、`statusA.state = "out"`、`statusB.wins = 1`。

Run: `node tools/verify-app.mjs`
Expected: PASS，生成器页面无 `pageerror`，预览图仍正常导出。

---

## Task 6: 导播台上下文跟随

**Files:**
- Modify: `director/console.html` — 顶部上下文条、赛间板跟随开关、BP 队名优先级、数据图状态
- Test: `tools/test-console-context.mjs`

**Interfaces:**
- Consumes: `state.live.context`（Task 1）
- Produces: `paintContext() -> void`
- Produces: `applyContextToInterval() -> Promise<void>`

- [ ] **Step 1: 写导播台页面测试**

Create `tools/test-console-context.mjs`:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ctx = {
  seriesId: "nb24ulp",
  seriesName: "2026 薄扶林王者杯",
  matchKey: "R16-5",
  matchLabel: "16强5 · 等我刷把电刀 vs 别让我取名",
  matchRound: "16强赛",
  gameId: "test-game",
  gameLabel: "第2局",
  blueTeam: "等我刷把电刀",
  redTeam: "别让我取名",
};

await fetch("http://127.0.0.1:8971/api/director/context", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(ctx),
});

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
await page.goto("http://127.0.0.1:8971/director", { waitUntil: "load" });
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
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (!out.chip.includes("16强5")) throw new Error("顶部上下文条未显示场次");
if (!out.follow) throw new Error("赛间板跟随开关默认应为开");
if (out.blue !== ctx.blueTeam || out.red !== ctx.redTeam) throw new Error("赛间板未跟随上下文");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-console-context.mjs`
Expected: FAIL，`#ctxChip` 为 `null`。

- [ ] **Step 3: 加顶部上下文条**

In `director/console.html`, inside the `view-head` after `<span class="dirty" id="dirtyTag">…</span>`, add:

```html
        <span class="ctx-chip" id="ctxChip">未选择场次</span>
```

Add to the `<style>` block:

```css
  .ctx-chip{display:none;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#eef4ff;color:#2457c5;font-size:12px;font-weight:700;border:1px solid #cfe0ff;max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ctx-chip.on{display:inline-flex}
```

- [ ] **Step 4: 渲染上下文条**

In the console script, after `paint()` definition, add:

```js
function paintContext() {
  const c = state && state.live && state.live.context;
  const chip = $("ctxChip");
  if (!chip) return;
  if (!c) {
    chip.textContent = "未选择场次";
    chip.classList.remove("on");
    chip.title = "";
    return;
  }
  chip.textContent = [c.matchLabel || "未关联赛程", c.gameLabel || ""].filter(Boolean).join(" · ");
  chip.classList.add("on");
  chip.title = [c.seriesName, c.matchRound, c.blueTeam + " vs " + c.redTeam].filter(Boolean).join(" / ");
}
```

Call `paintContext();` at the end of `paint()`.

- [ ] **Step 5: 赛间板加“跟随当前场次”**

In the 赛间板 block, after the `ivReal` label, add:

```html
            <label class="sw" style="display:flex;align-items:center;gap:6px;margin-top:5px">
              <input type="checkbox" id="ivFollow" checked /> 跟随当前场次
            </label>
```

Change `ivSettings()` to:

```js
const ivSettings = () => ({
  follow: true,
  ...((state && state.preview && state.preview.settings && state.preview.settings.interval) || {}),
});
```

Add:

```js
ivBind("ivFollow", "follow", "change", (e) => {
  if (e.checked) ctxAppliedKey = "";   // 重新打开跟随时，下一次 live 事件立即补填
});
```

`ctxAppliedKey` 在后面的 Step 6 声明；这个回调只在用户点击时执行，不会触发 TDZ。

In `syncIvForm()`, add:

```js
  const follow = $("ivFollow");
  if (follow) follow.checked = s.follow !== false;
```

- [ ] **Step 6: 上下文变化时自动填赛间板**

After `syncIvForm()`, add:

```js
let ctxAppliedKey = "";
async function applyContextToInterval() {
  const c = state && state.live && state.live.context;
  if (!c || !c.blueTeam || !c.redTeam) return;
  const s = ivSettings();
  if (s.follow === false) return;
  const key = [c.seriesId, c.matchKey, c.gameId, c.blueTeam, c.redTeam].join("|");
  if (key === ctxAppliedKey) return;
  ctxAppliedKey = key;
  if (s.blueTeam === c.blueTeam && s.redTeam === c.redTeam) return;
  state = await post("settings", { id: "interval", patch: { blueTeam: c.blueTeam, redTeam: c.redTeam } });
  paint();
  syncFrame();
}
```

Call `applyContextToInterval().catch(() => {});` after `paint(); syncFrame();` in all three places:
SSE `hello`、SSE `live`、以及首次 `fetch("/api/director/state")` 的回调。这样无论 SSE 和首屏请求谁先到，
赛间板都会跟上当前场次。

现有的 SSE 监听是一个循环：

```js
["preview", "onAir", "live"].forEach(ch => {
  source.addEventListener(ch, (e) => { state = JSON.parse(e.data); paint(); syncFrame(); });
});
```

把它拆成三个独立监听器；只在 `live` 监听器里追加 `applyContextToInterval().catch(() => {});`，
`preview` 和 `onAir` 保持原样，避免设置写回时自己触发自己。

- [ ] **Step 7: BP 队名优先取上下文**

In `bpStart` handler, replace the team selection lines:

```js
    const iv = ivSettings();
    const ctx = state && state.live && state.live.context;
    const blue = (ctx && ctx.blueTeam) || iv.blueTeam || (ivTeams[0] && ivTeams[0].name) || "蓝方";
    const red  = (ctx && ctx.redTeam)  || iv.redTeam  || (ivTeams[1] && ivTeams[1].name) || "红方";
```

- [ ] **Step 8: 数据图轮播项带场次**

In `chartItems()` in `assets/chart-core.js`, build a metadata object first and spread it into every item:

```js
function chartItems(){
  const s = S.series;
  const meta = contextSnapshot() || {};
  const ctx = {
    series: [{
      id: s.id, name: s.name,
      teams: JSON.parse(JSON.stringify(s.teams || [])),
      games: [JSON.parse(JSON.stringify(S.game))],
      current: 0,
    }],
    seriesId: s.id,
    prefs: JSON.parse(JSON.stringify(DB.prefs || {})),
    heroPick: JSON.parse(JSON.stringify(DB.heroPick || {})),
    matchKey: meta.matchKey || "",
    matchLabel: meta.matchLabel || "",
    gameLabel: meta.gameLabel || "",
  };
  const game = JSON.parse(JSON.stringify(S.game));
  const items = POSITIONS.map((pos, i) => ({
    ...ctx, kind: "card", idx: i, game, label: pos + "对位图",
  }));
  items.push({ ...ctx, kind: "overview", idx: -1, game, label: "五路总览" });
  return items;
}
```

This replaces the existing `chartItems()` body. The OBS badge in Task 7 reads `data.matchLabel` / `data.gameLabel`.

- [ ] **Step 9: 数据图状态显示场次**

In `paintChartOps()`, at the top after `const p = ...`, add:

```js
  const ctx = state && state.live && state.live.context;
  const ctxLabel = ctx ? [ctx.matchLabel, ctx.gameLabel].filter(Boolean).join(" · ") : "";
```

Then use `ctxLabel` in both the empty state and the normal status line.

Change the status line:

```js
    statusEl.textContent = "第 " + (p.index + 1) + " / " + p.items.length + " 张 · " + label
      + (ctxLabel ? " · " + ctxLabel : "")
      + " · " + (p.running ? ("自动 " + Math.round(p.intervalMs / 1000) + " 秒") : "已暂停");
```

For the empty state:

```js
    if (statusEl) statusEl.textContent = "尚未推送本局数据图" + (ctxLabel ? " · " + ctxLabel : "");
```

- [ ] **Step 10: 运行导播台测试**

Run: `node tools/test-console-context.mjs`
Expected: PASS，`chip` 包含 `16强5`，`follow = true`，蓝/红队名与上下文一致。

Run: `node tools/check-console.mjs`
Expected: 所有脚本块顶层执行通过，`全局名冲突：无`，退出码 0。

---

## Task 7: OBS 场景联动

**Files:**
- Modify: `director/obs.html` — 赛程图高亮、BP/阵容/赛间/数据图上下文标识
- Test: `tools/test-obs-context.mjs`

**Interfaces:**
- Consumes: `live.context`（Task 1）
- Produces: `contextLine(live) -> string`

- [ ] **Step 1: 写 OBS 测试**

Create `tools/test-obs-context.mjs`:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const ctx = {
  seriesId: "nb24ulp",
  seriesName: "2026 薄扶林王者杯",
  matchKey: "R16-5",
  matchLabel: "16强5 · 等我刷把电刀 vs 别让我取名",
  gameLabel: "第2局",
  blueTeam: "等我刷把电刀",
  redTeam: "别让我取名",
};
await fetch("http://127.0.0.1:8971/api/director/context", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(ctx),
});

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("http://127.0.0.1:8971/obs/bracket", { waitUntil: "load" });
await page.waitForTimeout(1200);
const out = await page.evaluate(() => ({
  active: !!document.querySelector(".bk-active"),
  activeKey: document.querySelector(".bk-active")?.dataset.key || "",
}));
await browser.close();
console.log(JSON.stringify(out, null, 2));
if (!out.active || out.activeKey !== "R16-5") throw new Error("赛程图未高亮当前场次");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-obs-context.mjs`
Expected: FAIL，`active = false`。

- [ ] **Step 3: 赛程图高亮当前场次**

In `director/obs.html`, add CSS near `.bk-match`:

```css
  .bk-match.bk-active{
    outline:3px solid rgba(255,210,90,.95);
    box-shadow:0 0 0 6px rgba(255,210,90,.16), 0 18px 48px rgba(0,0,0,.35);
    animation:bkActivePulse 2.4s ease-in-out infinite;
  }
  @keyframes bkActivePulse{
    0%,100%{ box-shadow:0 0 0 6px rgba(255,210,90,.14), 0 18px 48px rgba(0,0,0,.35); }
    50%{ box-shadow:0 0 0 10px rgba(255,210,90,.24), 0 18px 48px rgba(0,0,0,.35); }
  }
```

Change `renderBracketLive(bracket, change)` to `renderBracketLive(bracket, change, activeKey)`.
Change its cache key so a context-only change redraws:

```js
  const key = "bk" + seq + JSON.stringify([bracket, activeKey]);
```

After `stage.append(root);`, add:

```js
  if (activeKey) {
    const active = root.querySelector('[data-key="' + activeKey + '"]');
    if (active) active.classList.add("bk-active");
  }
```

If the existing “`change.kind === "sync"` 且数据没变就不重绘”分支还在，把它的条件补上
`&& lastBracketKey === key`。否则只换了当前场次、赛程数据没变时，高亮会被这条分支跳过。

Update the two call sites:

```js
  if (scene === "bracket") {
    const activeKey = live && live.context && live.bracket
      && live.context.seriesId === live.bracket.seriesId
      ? (live.context.matchKey || "") : "";
    renderBracketLive(live ? live.bracket : null, live ? live.bracketChange : null, activeKey);
    return;
  }
```

```js
    if (scene === "bracket") {
      const activeKey = st.live.context && st.live.bracket
        && st.live.context.seriesId === st.live.bracket.seriesId
        ? (st.live.context.matchKey || "") : "";
      renderBracketLive(st.live.bracket, st.live.bracketChange, activeKey);
    }
```

- [ ] **Step 4: 增加上下文行助手**

In `director/obs.html`, before `renderBp2()`, add:

```js
function contextLine(live) {
  const c = live && live.context;
  if (!c) return "";
  return [c.matchLabel, c.gameLabel].filter(Boolean).join(" · ");
}
```

- [ ] **Step 5: BP 板显示上下文**

Change `renderBp2(bp)` to `renderBp2(bp, live)`:

```js
function renderBp2(bp, live) {
  const ctx = contextLine(live);
  const key = "b2" + JSON.stringify([bp, ctx]);
```

Before `root.append(el("div", "b2-mark", ...))`, add:

```js
  if (ctx) root.append(el("div", "b2-ctx", ctx));
```

Add CSS:

```css
  .b2-ctx{
    position:absolute;left:0;right:0;bottom:34px;text-align:center;
    font-size:15px;font-weight:700;letter-spacing:.06em;
    color:rgba(42,58,78,.62);
  }
```

Change the call in `render(state)`:

```js
    renderBp(live ? live.bp : null, live);
```

Change the SSE `live` handler:

```js
    if (scene === "bp") renderBp(st.live.bp, st.live);
```

- [ ] **Step 6: 阵容板显示上下文**

Change `renderLineup(bp)` to `renderLineup(bp, live)`:

```js
function renderLineup(bp, live) {
  const ctx = contextLine(live);
  const key = "lu" + JSON.stringify([bp, ctx]);
```

After `root.append(head, body);`, add:

```js
  if (ctx) root.append(el("div", "lu-ctx", ctx));
```

Add CSS:

```css
  .lu-ctx{
    position:absolute;left:0;right:0;bottom:30px;text-align:center;
    font-size:15px;font-weight:700;letter-spacing:.06em;
    color:rgba(255,255,255,.72);text-shadow:0 2px 10px rgba(0,0,0,.45);
  }
```

Change the call in `render(state)`:

```js
    renderLineup(live ? live.bp : null, live);
```

Change the SSE `live` handler:

```js
    if (scene === "lineup") renderLineup(st.live.bp, st.live);
```

- [ ] **Step 7: 赛间板顶部显示场次**

In `renderInterval(settings, live)`, after `const stageName = ...`, add:

```js
  const ctx = contextLine(live);
```

Change:

```js
  stageBox.append(el("div", "iv-stage-kicker", "MATCH INTERVAL / PKC 2026"));
```

to:

```js
  stageBox.append(el("div", "iv-stage-kicker", ctx || "MATCH INTERVAL / PKC 2026"));
```

Add `ctx` to the render key:

```js
  const key = "iv" + JSON.stringify([s, blue, red, cd.remainingMs, cd.running, allTeams.length, ctx]);
```

- [ ] **Step 8: 数据图角标显示场次**

In `renderChart()`, replace the badge text line:

```js
      const ctx = [data.matchLabel, data.gameLabel].filter(Boolean).join(" · ");
      badge.textContent = (ctx ? ctx + " · " : "")
        + (idx + 1) + " / " + playlist.items.length + " · " + label;
```

- [ ] **Step 9: 运行 OBS 测试**

Run: `node tools/test-obs-context.mjs`
Expected: PASS，`active = true`，`activeKey = "R16-5"`。

---

## Task 8: 冲突提示、文档与全链路回归

**Files:**
- Modify: `assets/chart-core.js` — 确保 `renderBkLinkWarn()`、`renderMatchWarn()` 在抽签/队伍改动后调用
- Modify: `使用说明.md` — 增加“赛程图 ↔ 对局数据”一节
- Test: `tools/test-schedule-regression.mjs`

**Interfaces:**
- Consumes: 前 7 个任务的全部接口

- [ ] **Step 1: 抽签改动后刷新冲突提示**

In `renderBkGroups()` after `renderBkDrawWarn();`, add `renderBkLinkWarn();`.

In `renderBkDraw()` after `renderBkDrawWarn();`, add `renderBkLinkWarn();`.

In `bkOnTeamsChanged()` after `renderBkMatches();`, add `renderBkLinkWarn();`.

`commitTeamInput` 已在 Task 4 删除；确认 `applySideTeam()` 里仍然调用 `renderMatchWarn();`。

- [ ] **Step 2: 写回归脚本**

Create `tools/test-schedule-regression.mjs`:

```js
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW = process.env.PKC_PW_ROOT ||
  "C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(PW, "playwright"));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.route("**/api/store/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.route("**/api/director/**", (r) =>
  r.request().method() === "POST" ? r.abort() : r.continue());
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const a = s.teams[0].id, b = s.teams[1].id, c = s.teams[2].id;
  const br = window.PKC.bracket();
  br.draw[4] = { a, b };
  const g = window.PKC.openMatch("R16-5");
  g.ourId = c; g.oppId = b;                       // 人为制造队伍不一致
  window.PKC.renderGameBar();
  return {
    warn: document.querySelector("#matchWarn").textContent,
    issues: window.PKC.bkLinkIssues().length,
    ctx: window.PKC.contextSnapshot(),
  };
});
await browser.close();
console.log(JSON.stringify({ ...out, errors }, null, 2));
if (errors.length) throw new Error("页面出现错误：" + errors.join(" | "));
if (!out.warn.includes("赛程是")) throw new Error("队伍不一致未提示");
if (out.issues < 1) throw new Error("赛程关联冲突未统计");
if (out.ctx.matchKey !== "R16-5") throw new Error("上下文未指向 R16-5");
```

- [ ] **Step 3: 运行回归脚本**

Run: `node tools/test-schedule-regression.mjs`
Expected: PASS，`warn` 包含“赛程是”、`issues >= 1`、`ctx.matchKey = "R16-5"`、`errors = []`。

- [ ] **Step 4: 更新使用说明**

In `使用说明.md`, after the `## 三、淘汰赛赛程图` section and before `## 四、直播怎么用（OBS）`, insert:

```markdown
## 三·B、赛程图 ↔ 对局数据 联动

现在三块数据各有唯一入口，不要再跨页面手抄：

- **队伍库（②）**：只管队伍身份和选手名单。队名、主色、名单只在这里改。
- **淘汰赛赛程图（⑤）**：只管分组、对阵、晋级和大比分。分组以这里的下拉为准。
- **对局数据（①）**：只管单局战绩。每局会自动记住自己属于哪一场赛程。

### 从赛程图录一局

1. `⑤` 里找到已经排好两队的场次，点这一行右侧的 `📊`。
2. 系统会切到 `①`：没有数据就新建“第1局”，有数据就打开最近一局。
3. 蓝方/红方已经按赛程带好，直接 OCR 或手填即可。
4. `①` 顶部的“赛程场次”下拉可以随时切换场次；选“未关联赛程”可以看历史遗留的局。

### 用局分回填大比分

1. `⑤` 每场会显示“已录 N 局 · a:b”。
2. 点 `回填`，确认后把局分写进大比分；只有一方局数更多时才标记晋级。
3. 平局只填比分，不会自动晋级。

### 导播台跟随

`①` 切场次或切局后，导播台顶部会自动显示“16强5 · 第2局”。赛间板默认勾选“跟随当前场次”，
`开始 BP` 也会优先用当前场次的两队；仍然可以手动改，改完照常“推送到直播端”。
```

- [ ] **Step 5: 全链路验证**

Run each command and require exit code 0:

```powershell
node tools/test-context-model.mjs
node tools/test-match-ui.mjs
node tools/test-bracket-link.mjs
node tools/test-team-source.mjs
node tools/test-team-status.mjs
node tools/test-console-context.mjs
node tools/test-obs-context.mjs
node tools/test-schedule-regression.mjs
node tools/test-export-scope.mjs
node --test bp-core/test/store.test.js
node tools/check-console.mjs
node tools/verify-app.mjs
node tools/test-hero-lanes.mjs
node tools/test-ocr-tools.mjs
node tools/verify-kpl-style.mjs
```

- [ ] **Step 6: 人工验收**

在浏览器里按顺序做一遍：

1. 打开 `http://localhost:8971/director`，确认 `⑤ 淘汰赛赛程图` 能看到 `📊`、`回填` 和“已录 N 局”。
2. 点 `R16-5` 的 `📊`，确认切到 `① 对局数据`，队名已带入，顶部场次为 `16强5`。
3. 在 `①` 填一局比分，回 `⑤` 点 `回填`，确认大比分变成局分。
4. 回导播台，确认顶部上下文条显示 `16强5 · 第1局`，赛间板蓝/红队名自动填好。
5. 打开 `/obs/bracket`，确认 `R16-5` 有金色高亮。
6. 刷新生成器和导播台，确认场次和局仍然正确。

Expected: 六步全部通过；旧数据仍在“未关联赛程”里，没有被改写。

- [ ] **Step 7: 恢复真实上下文**

测试脚本会临时写入 `R16-5` / `test-game` 的上下文。验收结束后，在生成器里选中真实的当前场次和局，
执行一次 `window.PKC.publishContext(0)`，或重新打开生成器让它自动发布；确认
`数据/context.json` 里不再有 `test-game`。

---

## Task 9: 导出与多局对比按场次收敛

**Files:**
- Modify: `assets/chart-core.js` — 新增 `multiGames()`、`gamesForExport()`；改 `drawMulti()`、`exportList()`、`exportZip()`、`downloadFixed()`、`renderMgInfo()`
- Modify: `PKC赛后数据图生成器.html:381` — 勾选文案
- Test: `tools/test-export-scope.mjs`

**Interfaces:**
- Consumes: `S.game.matchKey`（Task 1）、`openMatch()`（Task 2）
- Produces: `multiGames() -> game[]`（当前场次内有效局）
- Produces: `gamesForExport(allGames) -> game[]`

- [ ] **Step 1: 写导出范围测试**

Create `tools/test-export-scope.mjs`:

```js
import { createRequire } from "node:module";
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
await page.goto("http://127.0.0.1:8971/" + encodeURIComponent("PKC赛后数据图生成器.html"), {
  waitUntil: "load",
});
await page.waitForFunction(() => window.PKC, null, { timeout: 20000 });

const out = await page.evaluate(() => {
  const s = window.PKC.series();
  s.games = [window.PKC.newGame("第1局", "")];
  s.current = 0;
  const a = s.teams[0].id, b = s.teams[1].id;
  window.PKC.bracket().draw[4] = { a, b };
  const g1 = window.PKC.openMatch("R16-5");
  g1.rows[0].our.k = "1";
  const g2 = window.PKC.newGame("第2局", "R16-5");
  g2.rows[0].our.k = "2";
  s.games.push(g2);
  const other = window.PKC.newGame("第1局", "R16-1");
  other.rows[0].our.k = "9";
  s.games.push(other);
  s.current = s.games.indexOf(g2);
  return {
    multi: window.PKC.multiGames().length,
    keys: window.PKC.multiGames().map(g => g.matchKey),
    exportAll: window.PKC.exportList(true).length,
    exportOne: window.PKC.exportList(false).length,
  };
});
await browser.close();
console.log(JSON.stringify(out, null, 2));

if (out.multi !== 2 || out.keys.some(k => k !== "R16-5")) throw new Error("多局范围未收敛到本场");
if (out.exportAll !== 12) throw new Error("本场两局应导出 12 张（每局 5 对位 + 总览）");
if (out.exportOne !== 6) throw new Error("当前局应导出 6 张");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/test-export-scope.mjs`
Expected: FAIL，报 `window.PKC.multiGames is not a function`，或 `multi` 包含 3 局。

- [ ] **Step 3: 增加场次范围助手**

In `assets/chart-core.js`, insert before `drawMulti()`:

```js
function multiGames(){
  const key = S.game ? (S.game.matchKey || "") : "";
  return S.series.games.filter(g => (g.matchKey || "") === key && gameHasData(g));
}
function gamesForExport(allGames){
  return allGames ? multiGames() : [S.game];
}
```

In `drawMulti()`, replace:

```js
  const s = S.series, t = th();
  const games = s.games.filter(gameHasData);
```

with:

```js
  const s = S.series, t = th();
  const games = multiGames();
```

- [ ] **Step 4: 导出列表与打包按场次取局**

In `exportList()`, replace:

```js
  const games = allGames ? S.series.games.filter(gameHasData) : [S.game];
```

with:

```js
  const games = gamesForExport(allGames);
```

In `exportZip()`, replace:

```js
  if (S.series.games.filter(gameHasData).length > 1){
```

with:

```js
  if (multiGames().length > 1){
```

In `downloadFixed()`, replace:

```js
  const games = allGames ? S.series.games.filter(gameHasData) : [S.game];
```

with:

```js
  const games = gamesForExport(allGames);
```

and replace:

```js
  if (S.series.games.filter(gameHasData).length > 1) items.push({ kind:"multi", game:null, idx:-1, name:"PKC_多局对比.png" });
```

with:

```js
  if (multiGames().length > 1) items.push({ kind:"multi", game:null, idx:-1, name:"PKC_多局对比.png" });
```

- [ ] **Step 5: 多局信息只列本场**

Replace `renderMgInfo()` with:

```js
function renderMgInfo(){
  const key = S.game ? (S.game.matchKey || "") : "";
  const rows = S.series.games.map((g, i) => ({ g, i }))
    .filter(x => (x.g.matchKey || "") === key);
  const gs = rows.map(x => x.g).filter(gameHasData);
  const winN = gs.filter(g => g.result === "win").length;
  $("#mgStat").textContent = gs.length + " 局有效数据" + (key ? " · 本场" : " · 未关联");
  $("#mgInfo").innerHTML = rows.map(({ g }) => {
    const our = S.team(g.ourId), opp = S.team(g.oppId);
    const ok = gameHasData(g);
    return '<div style="display:flex;gap:10px;align-items:center;padding:3px 0">'
      + '<b style="width:64px">' + esc(g.label) + '</b>'
      + '<span>' + esc(our.name || "—") + ' <b>' + esc(g.ourScore || "-") + '</b> : <b>'
      + esc(g.oppScore || "-") + '</b> ' + esc(opp.name || "—") + '</span>'
      + '<span class="tag ' + (ok ? "in" : "out") + '">' + (ok ? "已录入" : "空") + '</span>'
      + '<span class="tag ' + (g.result === "win" ? "in" : "out") + '">' + (g.result === "win" ? "WIN" : "LOSE") + '</span></div>';
  }).join("") + (gs.length ? '<div style="margin-top:6px">本场：蓝方 ' + winN + ' 胜 ' + (gs.length - winN) + ' 负</div>' : "");
}
```

- [ ] **Step 6: 改勾选文案**

In `PKC赛后数据图生成器.html:381`, change:

```html
<label class="sw"><input type="checkbox" id="swAllGames">导出包含所有局</label>
```

to:

```html
<label class="sw"><input type="checkbox" id="swAllGames">导出包含本场所有局</label>
```

- [ ] **Step 7: 导出函数**

In `window.PKC`, add:

```js
    multiGames, gamesForExport,
```

- [ ] **Step 8: 运行测试**

Run: `node tools/test-export-scope.mjs`
Expected: PASS，`multi = 2`、`keys = ["R16-5","R16-5"]`、`exportAll = 12`、`exportOne = 6`。

Run: `node tools/verify-app.mjs`
Expected: PASS，多局对比图仍能正常生成。

---

## Self-Review

- **Spec coverage:** 设计说明第 3 节的数据主权由 Task 4、5 落实；第 4 节的三条流程由 Task 2、3、6、7 落实；第 7 节的冲突处理由 Task 3、8 落实；第 8 节的 `④` 导出范围由 Task 9 落实；第 9 节的测试由每个任务的测试 + Task 8 回归落实。
- **Placeholder scan:** 没有 `TBD`、`TODO`、`稍后实现`；每个代码步骤都给了完整片段或明确的替换位置。
- **Type consistency:** `matchKey` 始终是字符串；`bkMatchByKey()` 返回 `null` 或 `bkTree().map` 的场次对象；`matchRecord()` 始终返回 `{ games, a, b }`；`contextSnapshot()` 的字段名与设计说明第 5.2 节一致。
- **Backward compatibility:** `normGame()` 给旧局补 `matchKey: ""`；`renderGameBar()` 在“未关联赛程”下显示旧局；`bkLinkIssues()` 不修改任何数据。
