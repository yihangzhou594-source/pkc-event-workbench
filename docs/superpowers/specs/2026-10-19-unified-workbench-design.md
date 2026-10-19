# 统一赛事工作台（方案 B）设计

日期：2026-10-19
状态：已确认方向（用户选择 B）

## 1. 目标

把现在的「首页 → 生成器 / 导播台」三个入口合并成一个赛事工作台：

- 一个地址 `http://localhost:8971/` 进入，左侧导航切换所有视图；
- 顶部常驻当前系列赛 / 场次 / 局与在播状态；
- 生成器作为「数据引擎」内嵌，不再单独对外当主入口；
- 统一视觉语言：深蓝赛事控制台 + 金色点缀，和直播画面同一套品牌色；
- 顺手补上「清除某场数据」。

## 2. 现状

| 页面 | 角色 | 问题 |
| --- | --- | --- |
| `/`（首页.html） | 静态入口卡片 | 和导播台重复，进去还要再点一次 |
| `/generator` | 数据工作台 | 5481 行单文件脚本，独立成站 |
| `/director` | 导播台外壳 | 已经内嵌生成器，但自己仍是“第二入口” |
| `/obs/*` | OBS 场景 | 保持不变 |

`director/console.html` 其实已经是一个外壳：左侧栏 + 导播视图 + `/generator?bare=1` iframe。
方案 B 的核心不是重写，而是**把这个外壳提升为整个网站**，再补齐概览页、顶部上下文条和视觉。

## 3. 架构

```
/                      工作台外壳（原 director/console.html）
├─ #view-overview      概览（原首页内容重做）
├─ #view-director      导播台（原有三栏）
└─ #view-engine        iframe → /generator?bare=1&tab=<data|bracket|teams|hero|out|help>

/generator              数据引擎（保留，供 iframe 使用）
/director               兼容别名 → 工作台（?view=director）
/obs/commentary|interval|bracket|chart   OBS 场景（不变）
```

### 3.1 前端文件

| 文件 | 职责 |
| --- | --- |
| `assets/shell.css` | 外壳设计系统：色板、侧栏、顶栏、概览卡片、对话框、toast |
| `assets/shell.js` | 视图路由、侧栏、顶栏上下文、iframe 桥、概览数据、撤销条 |
| `assets/embed-theme.css` | `bare=1` 时注入生成器，统一字体/圆角/主色，不改布局 |
| `director/console.html` | 外壳结构 + 导播三栏；导播内部样式与脚本保持内联（与大量 DOM id 强耦合，单独抽出收益低、回归风险高） |

### 3.2 服务端

- `server.mjs`：`/` 改为返回 `director/console.html`（no-store）。
- `director/routes.mjs`：`/director` 继续返回同一页面；`/generator?bare=1` 注入
  `<link rel="stylesheet" href="/assets/embed-theme.css">`。
- 所有既有 API 不变。

## 4. 视图与导航

侧栏分组：

| 分组 | 项 | 目标 |
| --- | --- | --- |
| 工作 | 概览 | `#view-overview` |
| 直播 | 导播台 | `#view-director` |
| 数据 | 对局数据 / 淘汰赛赛程 | iframe tab |
| 资料 | 队伍库 / 英雄图 | iframe tab |
| 输出 | 多局与导出 | iframe tab |
| 帮助 | 说明 | iframe tab |

URL 同步：`/?view=bracket`、`/?view=director`，刷新保持当前视图。
生成器内部调用 `switchTab()` 时通过 `postMessage({type:"pkc:tab"})` 回传，侧栏高亮跟着走。

## 5. 顶栏

- 左：当前视图标题。
- 中：`系列赛 › 场次 › 第 N 局`，蓝红队名和当前场面比分（来自 `/api/director/state` 的 live context）。
- 右：`在播：解说/赛间/…` 状态点 + 「打开 OBS 预览」。
- SSE `/api/director/stream` 实时更新，不需要手动刷新。

## 6. 概览页

1. **当前工作**：系列赛、场次、局、双方、比分；按钮「录这一局 / 看赛程 / 开导播台」。
2. **快捷入口**：四个 OBS 地址，一键复制。
3. **赛程进度**：队伍数、已录局数、在播场景、服务端口。
4. **第一次用**：三步说明。

## 7. 清除某场数据

定义：**一场 = 赛程里的一个 matchKey（BO5 / BO7 的一整个大场）**。

清除范围：

- 删除该 matchKey 关联的全部小局（含选手、KDA、经济、伤害、识别结果）；
- 删除赛程里的比分 `score[key]` 与晋级 `win[key]`；
- 保留对阵双方、分组、队伍库、其他场次。

入口：

1. 赛程页每场的操作条：`🗑 清除这场`；
2. 对局页上下文条：`清除本场数据`（仅当前局已关联赛程时显示）。

交互：

- 确认框写明「将删除 N 局对局记录 + 赛程比分，队伍与分组保留」；
- 执行后底部出现 10 秒「已清除 · 撤销」条，撤销恢复局数据、比分、晋级和当前选中项；
- 清除后如果当前局被删掉，自动跳到剩下的最后一局；没有剩余局则新建一局空数据。

## 8. 视觉

- 侧栏：`#0f1826 → #17243a` 渐变，金色 3px 激活条，白色文字，分组小标题。
- 顶栏：白底、56px、细边框。
- 主区：`#eef2f8` 底 + 轻微径向光。
- 卡片：白、14px 圆角、`0 8px 24px rgba(24,33,47,.06)`。
- 主色 `#2f6bff`，金色 `#c99a2e`，数字用 Bahnschrift。
- 生成器 iframe 只做主题对齐（字体、背景、圆角、按钮主色），不动它的排版。

## 9. 不做

- 不重写 `chart-core.js` 的业务逻辑（本轮只加清除功能与 postMessage）。
- 不合并 OBS 场景页。
- 不改数据文件格式。

## 10. 验收

- `node tools/check-console.mjs` 通过；
- `/` 打开就是工作台，侧栏 8 项都能切，刷新保持视图；
- 顶部上下文条随生成器选择实时变化；
- 赛程页清除某场后该场 0 局、比分清空、其他场次不受影响；撤销能完整恢复；
- 导播五场景、数据图推送、OBS 地址不受影响。
