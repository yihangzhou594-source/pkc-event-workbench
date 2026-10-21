# PKC Workbench UI and Interaction Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make navigation, current competition context, page hierarchy, and interaction feedback consistent across the workbench while preserving fast live directing controls.

**Architecture:** Keep the current server-rendered HTML, CSS, vanilla JavaScript, iframe embedding, and URL routes. Make the workbench shell the only primary navigator while embedded, keep the generator's own navigation when opened directly, and improve each page in small stages without changing its data protocols.

**Tech Stack:** Node.js native HTTP server, HTML, CSS, vanilla browser JavaScript, existing iframe `postMessage` bridge.

**Spec:** `docs/superpowers/specs/2026-10-21-workbench-ui-ux-design.md`

## Global Constraints

- Keep `/`, `/director`, `/generator`, `/obs/*` and existing `?view=` routes available.
- Do not change team, schedule, match-data, or current-context storage protocols or data ownership.
- Do not change OBS output dimensions, transparency, scene push/discard semantics, or live picture content.
- Do not introduce a frontend framework, external service, or runtime dependency.
- Do not force users to follow a pre-match → live → post-match order.
- Preserve the existing deep-blue, gold, and light-card visual system and the completed director artwork backgrounds.
- Keep direct `/generator` navigation usable while removing duplicate primary navigation only in the embedded `bare=1` mode.
- Do not add or run automated tests unless the user requests testing or verification; do not change real competition data during implementation.

## Review Focus

- Embedded generator versus direct `/generator`: verify the primary navigation appears exactly once in each mode (Task 1).
- Narrow viewport from 960px through 1150px: verify navigation can be discovered and the full current context can be opened (Task 1).
- Keyboard-only navigation: verify focus is visible, current view is announced, and toggles expose their expanded state (Task 2).
- Empty, saving, successful, and failed reads/writes: verify status is understandable and failures expose a recovery path (Task 2 and Task 3).
- Live directing: verify scene preview, push/discard controls, and existing OBS output remain immediately available and semantically unchanged (Task 3).

---

### Task 1: Unify shell navigation and preserve context at narrow widths

**Files:**
- Modify: `director/console.html` — add named shell controls for sidebar collapse and a full context disclosure.
- Modify: `director/routes.mjs` — keep embedded generator tab navigation hidden only for `bare=1`; preserve direct mode.
- Modify: `assets/shell.css` — responsive sidebar, context disclosure, and topbar layout.
- Modify: `assets/shell.js` — toggle state, update ARIA state, keep route/view and `postMessage` synchronization.
- Modify: `PKC赛后数据图生成器.html` — add styles needed for embedded versus direct tab navigation if route injection requires a stable selector.

**Interfaces:**
- Consumes: existing `VIEWS`, `setView(name, push)`, `switchEngine(tab)`, `wkCtx*` fields, `bare=1`, and the `pkc:tab` message.
- Produces: a shell-controlled collapsible sidebar and a context disclosure that displays the full current series, match, game, teams, score, and on-air scene without changing the current context.

- [x] **Step 1: Add named disclosure controls in `director/console.html`**
  Add a sidebar toggle and a context disclosure trigger/panel. Give each button a stable ID, visible label at narrow widths, `aria-controls`, and initial `aria-expanded="false"`. Keep the existing context value IDs so `assets/shell.js` continues updating them.

- [x] **Step 2: Implement shell toggle behavior in `assets/shell.js`**
  Bind each new control once. Toggle the existing shell classes, update `aria-expanded`, support Escape to close the context panel, and preserve `setView`, browser history, context IDs, and current-view synchronization.

- [x] **Step 3: Update responsive and disclosure styles in `assets/shell.css`**
  At the existing narrow breakpoints, keep a visible, named expand/collapse affordance. Let the context disclosure expose all context values in a readable panel instead of permanently hiding the series/match/game fields. Avoid obscuring primary controls with a permanently fixed overlay.

- [x] **Step 4: Scope embedded generator navigation hiding in `director/routes.mjs`**
  Give the injected `bare=1` style a stable selector and hide the generator's duplicate primary navigation (`.tabs`, `.topbar .brand`, and `.topbar .appnav`) plus the preview button already controlled by the shell. Keep theme/style/export actions, `#status`, the context bar, and nested bracket subnav visible. Do not inject the hiding style for direct `/generator` requests.

- [x] **Step 5: Confirm the navigation contract in source**
  Inspect the route output for both `/generator` and `/generator?bare=1`; confirm only the latter includes the primary-tab hiding rule. Inspect `setView`, `popstate`, and iframe tab messages to confirm existing URLs and view sync remain intact. Do not run the automated test suite.

### Task 2: Make keyboard focus and status feedback consistent

**Files:**
- Modify: `assets/shell.css` — shell `:focus-visible`, selected navigation treatment, and non-color status cues.
- Modify: `director/console.html` — landmark names and status-region semantics.
- Modify: `PKC赛后数据图生成器.html` — generator focus and live-region semantics for `#status` and `#toast`.
- Modify: `assets/pkc-core.js` — preserve existing `toast(msg)` and `status(msg, bad)` interfaces while ensuring their message regions are announced.
- Modify: `assets/pkc-data.js` — ensure existing async data actions keep actionable failure messages in the shared toast/status region.
- Modify: `director/herostats.html` and `assets/pkc-herostats.js` — expose capture progress and failure through the existing `#capMsg` region.
- Modify: `director/promo.html` and `assets/pkc-promo.js` — label page actions and surface existing save/export outcomes consistently.

**Interfaces:**
- Consumes: existing `toast(msg)`, `status(msg, bad)`, data action handlers, `#capMsg`, capture-status polling, and promo save/export handlers.
- Produces: visible keyboard focus throughout shell and embedded pages, plus semantic status announcements without changing existing messages or save APIs.

- [x] **Step 1: Add visible `:focus-visible` rules**
  Add high-contrast focus outlines for shell navigation, controls, links, generator tabs, and director actions. Preserve current pointer hover styles; do not remove browser focus outlines without replacing them.

- [x] **Step 2: Mark current view and interactive landmarks**
  In `assets/shell.js`, keep `aria-current="page"` synchronized with `.on` as `setView` and iframe tab messages change the view. In `director/console.html`, name the primary navigation and status regions. Ensure disclosure controls from Task 1 update `aria-expanded` on every state change.

- [x] **Step 3: Announce generator and capture status**
  Give `#status`, `#toast`, and `#capMsg` appropriate polite live-region semantics in their owning HTML. Keep error styling paired with readable text; do not announce high-frequency capture log output as a live region.

- [x] **Step 4: Normalize action outcome wording at existing handlers**
  In `assets/pkc-data.js`, `assets/pkc-herostats.js`, and `assets/pkc-promo.js`, use existing visible toast/status areas for loading, success, and failure; failures should give a concrete retry/recovery instruction. Keep API calls and save semantics unchanged.

- [x] **Step 5: Run static source checks**
  Run `node --check assets/shell.js`, `node --check assets/pkc-core.js`, `node --check assets/pkc-data.js`, `node --check assets/pkc-herostats.js`, and `node --check assets/pkc-promo.js`; run `git diff --check`. These are syntax/whitespace checks, not automated tests.

### Task 3: Clarify page hierarchy while preserving live-operation speed

**Files:**
- Modify: `director/console.html` and `assets/shell.js` — overview heading, current readiness, recommended next action, and live status.
- Modify: `assets/shell.css` — shared page-title and action hierarchy for shell views.
- Modify: `PKC赛后数据图生成器.html` — consistent view headings, context position, and primary action hierarchy for data, bracket, teams, hero, output, and help views.
- Modify: `director/herostats.html` and `assets/pkc-herostats.js` — clear section headings and grouped capture/review/manual-entry priorities.
- Modify: `director/promo.html` and `assets/pkc-promo.js` — clear poster setup, preview, and export priorities.
- Modify: `director/console.html` — director panel grouping and labels only where this does not move critical live controls out of the immediate view.

**Interfaces:**
- Consumes: existing overview checks and workflow cards, generator view tabs and context fields, hero-stats sections, promo preview/export handlers, and director preview/on-air state.
- Produces: consistent page headings, context placement, primary-action hierarchy, and task-aligned optional controls; no new domain data or state transitions.

- [x] **Step 1: Clarify overview priority using existing readiness checks**
  In `assets/shell.js`, use existing `renderChecks` and workflow data to visually distinguish the next useful action and any blocking missing context. Keep all three workflow cards and the sidebar available; do not infer state from time or switch the active event.

- [x] **Step 2: Keep generator view hierarchy explicit**
  Preserve the existing card headings, sticky context bar, and page-specific action locations. Give the active `.tab` control a synchronized `aria-pressed` state in `PKC赛后数据图生成器.html` and `assets/pkc-data.js`. Preserve view IDs, layout behavior, and generated image behavior.

- [x] **Step 3: Group hero-stats and promo tasks**
  In the respective HTML and JS, make the sequence of capture/import → review/adjust → save/export clear. Keep each existing workflow reachable without hiding a currently selected value or changing API semantics.

- [x] **Step 4: Refine director panel labels and grouping**
  In `director/console.html`, clarify preview, scene selection, and on-air status grouping while keeping scene selection and push/discard actions immediately accessible. Do not change OBS scene composition, output semantics, or the existing art backgrounds.

- [x] **Step 5: Finish with static checks and change-scope review**
  Run `node --check` for each modified JS/MJS file and `git diff --check`. Review the diff against the spec's compatibility boundaries; do not run automated tests unless the user requests them.
