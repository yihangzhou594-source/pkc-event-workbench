# Director editor-first implementation plan

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
