# PKC 现场安全与紧凑工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成导播安全、场景预检、录入减负、赛程精简、出图可读性和版本恢复六项改进。

**Architecture:** 新增纯函数预检模块、JSON 备份工具和独立恢复 UI 模块；导播状态机负责推送历史和回退，现有生成器与工作台只消费统一接口。

**Tech Stack:** Node.js 20、原生 HTTP、原生 ES modules、浏览器原生 DOM/Canvas、Playwright 回归。

**Spec:** `docs/superpowers/specs/2026-10-23-production-safety-and-compact-workbench-design.md`

## Global Constraints

- 不改变 `/`、`/director`、`/generator`、`/obs/*` 和 `?view=` 路由。
- 不改变 OBS 1920×1080 输出、蓝红语义和现场直连通道。
- 所有生产代码先有失败测试，再实现最小行为。
- 保留当前分支已有未提交改动，不执行 reset 或 checkout。
- 备份恢复必须先保留当前版本，文件名不得跳出 `数据/_backup/`。

---

### Task 1: 导播推送安全

**Files:**
- Modify: `bp-core/src/store.js`
- Test: `bp-core/test/store.test.js`
- Modify: `director/routes.mjs`

**Interfaces:**
- Produces: `push({ force })`, `undoPush()`, snapshot fields `canUndoPush` and `lastPush`.
- Produces: `POST /api/director/undo-push`.

- [ ] **Step 1: Write failing store tests**

```js
test('push 记录回退点并可撤回', () => {
  const s = createStore();
  s.setScene(SceneId.INTERVAL);
  s.push();
  s.setScene(SceneId.CHART);
  s.push();
  assert.equal(s.snapshot().canUndoPush, true);
  s.undoPush();
  assert.equal(s.snapshot().onAir.scene, SceneId.INTERVAL);
  assert.equal(s.snapshot().preview.scene, SceneId.INTERVAL);
});

test('非空画面切空白需要 force', () => {
  const s = createStore();
  s.setScene(SceneId.COMMENTARY);
  s.push();
  s.setScene(SceneId.BLANK);
  assert.throws(() => s.push(), (e) => e.code === 'blank_confirm_required');
  assert.equal(s.push({ force: true }).onAir.scene, SceneId.BLANK);
});
```

- [ ] **Step 2: Run the store test and confirm both tests fail**

Run: `node bp-core/test/store.test.js`

- [ ] **Step 3: Implement bounded push history and blank protection**

```js
const pushHistory = [];
function push(options = {}) {
  if (preview.scene === SceneId.BLANK && onAir.scene !== SceneId.BLANK && !options.force) {
    throw new StoreError('blank_confirm_required', '推送到空白画面前需要确认');
  }
  pushHistory.push({ scene: onAir.scene, settings: clone(onAir.settings), at: new Date().toISOString() });
  if (pushHistory.length > 20) pushHistory.shift();
  onAir.scene = preview.scene;
  onAir.settings = clone(preview.settings);
  onAir.revision += 1;
  notify('onAir');
  return snapshot();
}
```

- [ ] **Step 4: Add API route and rerun store tests**

Run: `node bp-core/test/store.test.js`

- [ ] **Step 5: Verify syntax**

Run: `node --check director/routes.mjs`

---

### Task 2: 统一场景预检

**Files:**
- Create: `lib/production-readiness.mjs`
- Create: `tools/test-production-readiness.mjs`
- Modify: `director/routes.mjs`
- Modify: `assets/shell.js`
- Modify: `assets/shell.css`
- Modify: `director/console.html`

**Interfaces:**
- Produces: `buildProductionReadiness(input): { seriesId, context, overall, scenes }`.
- Consumes: `library`, `matches`, `bracket`, `context`.
- Produces: `GET /api/director/readiness`.

- [ ] **Step 1: Write failing readiness test**

```js
const result = buildProductionReadiness({ library, matches, bracket, context });
assert.equal(result.scenes.find((s) => s.id === 'chart').status, 'ready');
assert.equal(result.overall.firstBlocker, null);
```

- [ ] **Step 2: Run test and confirm module-not-found failure**

Run: `node tools/test-production-readiness.mjs`

- [ ] **Step 3: Implement readiness rules**

Implement roster, bracket, game and context checks with deterministic blocker codes. Do not throw on missing data; return blocked states.

- [ ] **Step 4: Expose route and render the same result in overview and director**

Render scene rows with status text, summary and a navigation button. Refetch after store saves and on SSE state updates.

- [ ] **Step 5: Block critical push unless explicitly forced**

Return HTTP 409 `{ error: 'readiness_blocked', readiness }` when the selected scene is blocked. The director confirms the exact blocker and retries with `{ force: true }` only after approval.

- [ ] **Step 6: Run readiness and server syntax tests**

Run: `node tools/test-production-readiness.mjs && node --check director/routes.mjs`

---

### Task 3: 导播台交互

**Files:**
- Modify: `director/console.html`
- Test: `tools/test-workbench-improvements.mjs`

**Interfaces:**
- Consumes: `POST /api/director/push`, `POST /api/director/undo-push`, `GET /api/director/readiness`.
- Produces: `#btnUndoPush`, `#directorReadiness`.

- [ ] **Step 1: Add browser regression expectations**

Assert the director contains undo, readiness, `U` shortcut text, and push helper handles `blank_confirm_required`.

- [ ] **Step 2: Implement shared push helper**

Use one `postPush(force)` for the top button, space bar, chart air button and spotlight push button. Emergency `B` calls `postPush(true)`.

- [ ] **Step 3: Paint undo state and readiness**

Disable undo when no history exists; show the current on-air scene and last push time; each readiness row links to its repair view.

- [ ] **Step 4: Run browser test against a temporary local server**

Run: `node tools/test-workbench-improvements.mjs`

---

### Task 4: 对局录入减负

**Files:**
- Modify: `PKC赛后数据图生成器.html`
- Modify: `assets/pkc-data.js`
- Modify: `assets/pkc-app.js`
- Modify: `assets/pkc-ocr.js`
- Modify: `tools/test-workbench-improvements.mjs`

**Interfaces:**
- Produces: `setImportToolsOpen(open)`, `collapseImportToolsAfterSuccess()`.
- Extends: `collectIssues()` with duplicate-game, score and duration checks.

- [ ] **Step 1: Add failing browser assertions for `#importTools`, `#btnImportToggle`, issue preview and remaining-issues disclosure**

- [ ] **Step 2: Split import tools from OCR review and preserve review visibility**

Move upload, AI controls and paste controls into `#importTools`; keep `#ocrReview` outside it.

- [ ] **Step 3: Collapse tools after successful parse, AI OCR and local OCR**

Keep `#ocrReview` visible and show a concise success state with “展开重新识别”.

- [ ] **Step 4: Limit visible issues to three and keep the full list accessible**

Create buttons with the same focus/scroll behavior for hidden issues.

- [ ] **Step 5: Add duplicate and format diagnostics**

Check same match key plus label, negative/non-numeric scores, invalid duration, and duplicate players.

- [ ] **Step 6: Run browser regression**

Run: `node tools/test-workbench-improvements.mjs`

---

### Task 5: 赛程页精简与撤销

**Files:**
- Modify: `PKC赛后数据图生成器.html`
- Modify: `assets/pkc-export.js`
- Modify: `assets/pkc-app.js`
- Modify: `tools/test-workbench-improvements.mjs`

**Interfaces:**
- Consumes: `showUndoBar(text, onUndo)`.
- Produces: `.bracket-help` disclosure for long rules.

- [ ] **Step 1: Add browser assertion that bracket rules are inside `.bracket-help` and bulk actions expose undo**

- [ ] **Step 2: Collapse long static instructions**

Keep headings, warnings and controls visible. Put drafting rules and explanatory paragraphs inside named disclosures.

- [ ] **Step 3: Add immediate undo to group clear, draw clear and result clear**

Snapshot only the affected bracket fields, restore them on undo, rerender and resave.

- [ ] **Step 4: Run browser regression**

Run: `node tools/test-workbench-improvements.mjs`

---

### Task 6: 出图可读性

**Files:**
- Modify: `assets/pkc-draw.js`
- Modify: `assets/pkc-app.js`
- Test: `tools/test-workbench-improvements.mjs`

**Interfaces:**
- Keeps: 1920×1080 canvas and all existing fields.

- [ ] **Step 1: Add canvas smoke test that renders a complete KPL card and checks non-empty output**

- [ ] **Step 2: Increase radar labels, numeric labels and compare values without changing canvas geometry**

- [ ] **Step 3: Add normalization footnote and concise legend**

Place “雷达：每项以双方较高值为 100%” in the card header area.

- [ ] **Step 4: Render a PNG and inspect at 960×540**

Run the browser test and inspect the generated PNG with the image viewer.

---

### Task 7: 版本恢复与 JSON 备份

**Files:**
- Modify: `lib/json-store.mjs`
- Create: `tools/test-json-store.mjs`
- Modify: `server.mjs`
- Create: `assets/pkc-recovery.js`
- Modify: `PKC赛后数据图生成器.html`
- Modify: `assets/pkc-export.js`
- Modify: `assets/pkc-app.js`
- Modify: `tools/test-workbench-improvements.mjs`

**Interfaces:**
- Produces: `listBackupVersions(backupDir, key)`.
- Produces: `restoreJsonBackup(targetFile, backupDir, key, name)`.
- Produces: `GET /api/store/backups?key=...`, `POST /api/store/restore`, `GET /api/store/audit`, `POST /api/store/audit`.
- Produces: `window.PKC_RECOVERY.open()`, `window.PKC_RECOVERY.audit(...)`.

- [ ] **Step 1: Write failing backup utility test**

```js
const backup = path.join(dir, '_backup', 'matches-2026-10-23T10-00-00-000Z.json');
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.writeFileSync(backup, '{"games":{"s1":[]}}');
assert.equal(listBackupVersions(path.dirname(backup), 'matches').length, 1);
restoreJsonBackup(target, path.dirname(backup), 'matches', path.basename(backup));
assert.equal(fs.readFileSync(target, 'utf8'), '{"games":{"s1":[]}}');
```

- [ ] **Step 2: Run test and confirm missing export failure**

Run: `node tools/test-json-store.mjs`

- [ ] **Step 3: Implement listing, safe restore and forced pre-restore backup**

Validate key and basename, parse JSON before writing, and return a new revision.

- [ ] **Step 4: Add server routes and audit append/read**

Reject unknown keys and unsafe names. Keep audit reads to the newest 100 entries.

- [ ] **Step 5: Build recovery dialog and full JSON import/export**

List recent versions by data type, require confirmation, reload after restore, and validate import envelope version and payload shapes.

- [ ] **Step 6: Wire destructive-action audit calls**

Record clear-match, clear-bracket-draw, clear-bracket-groups, clear-results, JSON import and version restore.

- [ ] **Step 7: Run unit and browser tests**

Run: `node tools/test-json-store.mjs && node tools/test-workbench-improvements.mjs`

---

### Task 8: 文档和完整验证

**Files:**
- Modify: `使用说明.md`
- Modify: `项目地图.md`
- Modify: `tools/test-all.mjs` only if test grouping needs adjustment

- [ ] **Step 1: Document shortcuts, readiness, data recovery and JSON behavior**

- [ ] **Step 2: Run fast suite**

Run: `node tools/test-all.mjs --fast`

- [ ] **Step 3: Start a local server and run browser suite**

Run: `node tools/test-all.mjs --browser`

- [ ] **Step 4: Run complete suite**

Run: `node tools/test-all.mjs`

- [ ] **Step 5: Inspect final diff for unrelated changes**

Run: `git diff --check` and `git diff --stat`
