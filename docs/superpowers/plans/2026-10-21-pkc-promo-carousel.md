# PKC 选手宣传轮播与首发名单海报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronized five-position player spotlight scene and export, then redesign the existing pre-match poster as a 16:9 starting-lineup graphic.

**Architecture:** The promo page edits both teams' five player/hero pairs and submits a snapshot to a new server-authoritative live playlist. A new `spotlight` scene renders the same current playlist in OBS and the promo page, with image bytes proxied from Tencent's official CDN so canvas exports remain same-origin. Existing team and player roster prefill remains in place; the static poster and spotlight graphic have separate export buttons.

**Tech Stack:** Vanilla JavaScript, HTML/CSS, Canvas 2D, Node.js ESM, existing director Store/SSE/API, existing UI and file serving.

**Spec:** `docs/superpowers/specs/2026-10-21-pkc-promo-carousel-design.md`

## Global Constraints

- Live canvas and exported spotlight PNG are 1920×1080.
- The center headline is “2026 PKC 淘汰赛 · 16进8”.
- Exactly five roles cycle in order: 上单、打野、中路、发育路、游走; both teams show the same role at the same index.
- Team and player names prefill from the current team library and remain editable; representative hero names are hand-entered.
- The carousel interval defaults to 8000 ms and is driven by one server-authoritative index shared through SSE.
- Hero art comes from Tencent's official CDN; unavailable art must not hide the typed hero name or prevent PNG export.
- The lineup poster remains 16:9 and includes five starters and lanes for each team.
- Do not change bracket, match data, BP, or existing chart playlist behavior.
- Do not copy third-party event logos or player photos from the visual references.

## Review Focus

- Unknown or duplicate hero names: preserve the entered label and only show art for an exact directory match.
- Official hero directory/CDN timeout or missing image: keep controls responsive and allow export with text fallback.
- Empty roster entries: skip auto-start when fewer than two paired positions are renderable; keep manual navigation safe.
- Rapid start/pause/step actions: reset server timing and avoid stale delayed advances.
- PNG export while remote art is loading: render only after same-origin image load settles, with a bounded fallback path.

---

### Task 1: Add the spotlight playlist to the director Store

**Files:**
- Modify: `bp-core/src/store.js`

**Interfaces:**
- Produces `live.spotlightPlaylist` with `{ teams, items, index, intervalMs, running, startedAt }`.
- Produces `setSpotlightPlaylist(patch)` and `stepSpotlightPlaylist(dir)` Store methods following the chart playlist conventions.
- `items` hold five normalized lane entries, each with `lane`, `blue: { player, heroName, heroId }`, and `red: { player, heroName, heroId }`.

- [ ] Add initial `spotlightPlaylist: null` to `initialLive()`.
- [ ] Implement `setSpotlightPlaylist(patch)` with deep-cloned team/item state, exactly five lane slots, bounded `intervalMs` from 3000 to 60000, clamped `index`, and a refreshed `startedAt`.
- [ ] Implement `stepSpotlightPlaylist(dir)` with wraparound indexing and timer reset; no-op safely if no playlist/items exist.
- [ ] Return both methods from `createStore()` and verify the live state snapshot remains JSON-serializable.
- [ ] Run `git diff --check -- bp-core/src/store.js`.

### Task 2: Add official Tencent hero lookup and same-origin image reads

**Files:**
- Modify: `server.mjs`

**Interfaces:**
- Add a cached hero catalog fetched from Tencent's official hero directory and exposed as `GET /api/tencent-heroes` with `{ heroes: [{ id, name }] }`.
- Add `GET /tencent-hero/:id` that accepts only IDs in the loaded catalog, fetches the selected official CDN artwork, and returns image bytes with a short cache lifetime.
- Use `https://pvp.qq.com/web201605/js/herolist.json` for the official `{ename,cname}` hero mapping and `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-mobileskin-1.jpg` for portrait artwork.

- [ ] Add a bounded-time official directory fetch and in-memory cache; report a controlled error when the directory is unavailable.
- [ ] Add a same-origin artwork proxy using only catalog IDs; reject malformed and unknown IDs before making the upstream request.
- [ ] Set the upstream request timeout and image content type/cache headers; do not accept an arbitrary upstream URL from the request.
- [ ] Review directory, image, and timeout fallback paths, then run `git diff --check -- server.mjs`.

### Task 3: Register spotlight scene and playlist routes/timer

**Files:**
- Modify: `bp-core/src/scenes.js`
- Modify: `director/routes.mjs`

**Interfaces:**
- Add scene ID `spotlight`, label `宣传轮播`, and OBS path `/obs/spotlight`.
- Add POST routes `/api/director/spotlight/playlist` accepting `{ patch }` and `/api/director/spotlight/step` accepting `{ dir }`.
- Add service-authoritative interval advancement for `live.spotlightPlaylist` at the existing 500 ms timer cadence.

- [ ] Register `SceneId.SPOTLIGHT` as a pushed scene.
- [ ] Dispatch the new playlist and step actions to the Store methods from Task 1.
- [ ] Add a timer using the same elapsed-time check as the existing chart playlist; require at least two renderable entries before auto-advancing.
- [ ] Inspect the handler notification flow to ensure the updated scene list and playlist are included in SSE; run `git diff --check -- bp-core/src/scenes.js director/routes.mjs`.

### Task 4: Build a shared spotlight Canvas renderer

**Files:**
- Create: `assets/pkc-spotlight.js`

**Interfaces:**
- Export a browser global `window.PKCSpotlight` with `draw(canvas, playlist, options): Promise<void>` and `loadHeroCatalog(): Promise<Hero[]>`.
- `draw` renders one indexed 1920×1080 frame, loads art only through `/tencent-hero/:id`, and falls back to hero text if image loading fails.

- [ ] Implement catalog loading and exact name-to-ID matching without overriding manually typed names.
- [ ] Draw the fixed headline, paired player/hero focal panels, lane indicator, and team names beneath each side.
- [ ] Use the same draw path for the promo-page preview, its PNG export, and OBS rendering.
- [ ] Review empty-playlist and missing-image branches for safe placeholder behavior; run `git diff --check -- assets/pkc-spotlight.js`.

### Task 5: Add OBS rendering for the new scene

**Files:**
- Modify: `director/obs.html`

**Interfaces:**
- Resolve `spotlight` as a valid scene path and render `live.spotlightPlaylist` in preview/on-air mode using `window.PKCSpotlight.draw`.
- On live SSE events, redraw only when the active scene is `spotlight`.

- [ ] Load `assets/pkc-spotlight.js` in the OBS page.
- [ ] Add `renderSpotlight(playlist)` with an explicit waiting state for an absent playlist and a canvas sized 1920×1080 for populated state.
- [ ] Handle hello, preview, onAir, and live updates consistently with the existing scene renderer; avoid a full-stage reset for index-only changes if it causes flashing.
- [ ] Confirm scene path resolution and run `git diff --check -- director/obs.html`.

### Task 6: Add promo inputs, live controls, and spotlight PNG export

**Files:**
- Modify: `director/promo.html`
- Modify: `assets/pkc-promo.js`
- Modify: `director/console.html`

**Interfaces:**
- Each of the existing ten player rows gains an editable representative-hero field, with Tencent catalog suggestions and free-text entry.
- Add controls for interval, previous/next, start/pause, and “推送并切到直播”.
- Add “导出当前轮播画面 PNG” alongside the existing pre-match poster download.
- Add a scene-specific console operations panel displaying current role/index and live state.

- [ ] Add hero inputs without removing role and player-name fields; preserve roster auto-fill behavior.
- [ ] Build a five-item playlist from the current form and push it using the new routes; restore the current playlist into the form when the promo page reloads.
- [ ] Wire interval, manual stepping, start/pause, and scene push controls; keep status text clear on invalid input or unavailable Tencent data.
- [ ] Add a separate 1920×1080 spotlight preview canvas and export its currently selected frame to PNG after image loading settles.
- [ ] Add promo-specific scene operations in `console.html`, including index/role, playback state, previous/next, interval, and pause/resume.
- [ ] Run `git diff --check -- director/promo.html assets/pkc-promo.js director/console.html`.

### Task 7: Redesign the pre-match poster as a 16:9 starting-lineup graphic

**Files:**
- Modify: `director/promo.html`
- Modify: `assets/pkc-promo.js`

**Interfaces:**
- Keep existing poster download as a separate action from spotlight PNG export.
- Preserve editable event, stage, date, time, team, five-player roster, and footer data.

- [ ] Replace the dark player-card composition with a warm gold/light 16:9 lineup layout inspired by reference image 2: event and stage header, team names with VS, a dominant “首发名单” title, and two five-row lane/name lists.
- [ ] Retain team-library prefill, manual edits, optional team-color accents, and existing PNG naming.
- [ ] Check long team/player names, blank starters, and missing optional fields do not overlap or clip; run `git diff --check -- director/promo.html assets/pkc-promo.js`.
