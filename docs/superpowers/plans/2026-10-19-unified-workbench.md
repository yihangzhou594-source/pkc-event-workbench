# 统一赛事工作台 · 实施计划

> 本项目不是 git 仓库，计划中的「提交」步骤改为「跑回归 + 截图确认」。

**Goal:** 把首页 / 数据工作台 / 导播台合并成一个 `/` 工作台，并补上「清除某场数据」。

**Architecture:** 复用现有的 `director/console.html` 外壳（已内嵌生成器），升级为全站入口；
抽 `shell.css` / `shell.js` / `director.css` / `director.js`；生成器只做主题注入。

**Tech Stack:** 原生 HTML/CSS/JS、Node HTTP 服务、Playwright 回归脚本。

**Spec:** `docs/superpowers/specs/2026-10-19-unified-workbench-design.md`

## 全局约束

- 不改 `数据/*.json` 的字段结构。
- 不动 `director/obs.html` 的画面。
- 生成器 iframe 只加主题样式，不改布局。
- 面向中文界面，字号不小于 11px。

---

### Task 1：抽出外壳资源

**Files:**
- Create: `assets/shell.css`
- Create: `assets/shell.js`
- Modify: `director/console.html`

- [x] 新建 `assets/shell.css`，承接侧栏 / 顶栏 / 概览 / 撤销条。
- [x] 新建 `assets/shell.js`，承接视图路由、iframe 桥、顶栏上下文。
- [x] console.html 删除旧的外壳样式块，改为 `link` + `script src`。
- [x] 导播三栏的内部样式与脚本保持内联（与大量 DOM id 强耦合，抽出的收益低于回归风险）。
- [x] 跑 `node tools/check-console.mjs`，确认无顶层报错、无全局冲突。

### Task 2：工作台上线（`/`）

**Files:**
- Modify: `server.mjs`（`/` 返回 console.html）
- Modify: `director/routes.mjs`（`/director` 与 `/` 同页）
- Modify: `assets/shell.js`

- [ ] `/` 返回工作台，`/director` 仍可用。
- [ ] URL `?view=` 与侧栏双向同步。
- [ ] 侧栏 8 项切换：概览 / 导播台 / 对局 / 赛程 / 队伍 / 英雄 / 导出 / 说明。
- [ ] iframe 懒切换：第一次进入数据视图时调用 `switchTab()`，失败重试 3 次。
- [ ] 生成器 `switchTab` 里 `postMessage` 回传，侧栏高亮同步。

### Task 3：顶栏上下文 + 概览页

**Files:**
- Modify: `director/console.html`（顶栏、概览 view）
- Modify: `assets/shell.js`
- Modify: `assets/shell.css`

- [ ] 顶栏显示 `系列赛 › 场次 › 局` 与蓝红队、比分。
- [ ] 订阅 `/api/director/stream`，`live` / `onAir` 事件实时刷新。
- [ ] 概览页：当前工作卡、四个 OBS 地址（可复制）、统计（队伍数/局数/端口/在播）、三步上手。

### Task 4：生成器主题注入

**Files:**
- Create: `assets/embed-theme.css`
- Modify: `director/routes.mjs`

- [ ] `bare=1` 时注入主题样式链接。
- [ ] 只改字体、背景、面板圆角、主色、输入焦点，不改尺寸与栅格。
- [ ] 截图确认对局页 / 赛程页排版未破。

### Task 5：清除某场数据

**Files:**
- Modify: `assets/chart-core.js`
- Modify: `PKC赛后数据图生成器.html`（上下文条按钮）
- Modify: `assets/embed-theme.css`（按钮视觉）

- [ ] 新函数 `clearMatchData(key)`：删局、删比分、删晋级，返回快照。
- [ ] 新函数 `restoreMatchData(snapshot)`：按原索引插回。
- [ ] 赛程页每场加 `🗑 清除这场`，带局数确认。
- [ ] 对局页上下文条加 `清除本场数据`（仅关联赛程时显示）。
- [ ] 底部 10 秒撤销条。
- [ ] 回归：清除后该场 0 局、比分空、其他场次不变；撤销完整恢复。

### Task 6：文档与验收

**Files:**
- Modify: `项目地图.md`
- Modify: `使用说明.md`
- Modify: `开始使用.md`

- [ ] 更新入口说明：`/` 是工作台，`/generator` 仅供内嵌。
- [ ] 补「清除某场数据」操作说明。
- [ ] 跑全套：`check-console`、`test-commentary-scene`、`test-commentary-banner`、`test-obs-scenes`、bp-core 测试。
- [ ] 截图：概览、导播、对局、赛程。
