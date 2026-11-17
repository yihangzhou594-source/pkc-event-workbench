# Director editor-first implementation plan

> 历史记录。提交 9ba1c4b 于 2026-11-13 将 ≥1000px 的导播布局改为监看与编辑并排。现行布局见 [director-editor.css](../../assets/director-editor.css)。发布检查以当前断点为准。

> Use superpowers:executing-plans to implement task by task.

Goal: larger editing area with a compact preview above, always visible push controls.
Architecture: preserve DOM IDs and handlers; scoped CSS grid reflows scene navigation, monitor and editor. Add guarded push handling and explicit effect labels.
Tech Stack: HTML, CSS, vanilla JavaScript, existing Node checks.
Spec: docs/plans/2026-11-07-director-editor-design.md

- [x] Add scoped director-editor.css: scene navigation left, compact monitor above large editor, sticky command bar; responsive at 1280/1440/1920 and narrow screens.
- [x] Improve labels, help disclosure and live/preview feedback; prevent repeated push requests and expose failures.
- [x] Run console/context checks, inspect real rendered scenes at target widths, run design detectors and fix material findings.
Constraints: preserve all routes, IDs, event handlers, OBS visuals and existing data. User confirmed preview above editor.
Review focus: long player names, narrow screens, hidden scene panels, repeated push and server errors.

Verification: check-console, test-console-context, test-remote-control, test-director-editor passed. Chrome rendered editor and scene switching. Hallmark rendered 5 viewport captures; remaining hidden-text detection is expected for inactive tabs and closed details, not missing content. The live scene badge expands its button intentionally; collapsed-details bounds finding is not a visible clipping defect. No blanket clean-lint claim.

## 现行发布验收

- 用 `npm run test:smoke` 检查独立工作台、OBS 和手机录入。先用 `npm ci` 和 `npx playwright install chromium --only-shell` 安装依赖。
- 核对 760/761、999/1000、1280、1440、1920 像素下的监看和编辑位置。使用长队名检查横向溢出。滚动时核对推送命令可达，隐藏面板控件不会获得键盘焦点。
- 预检取消保持原画面。准备 B 局期间继续播放 A，推送后切到 B，撤回后恢复 A。网络错误后推送按钮应恢复可用。
