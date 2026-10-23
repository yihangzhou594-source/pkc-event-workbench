/* ============================================================
   PKC 赛事工作台 · 外壳逻辑
   - 侧栏 / 视图路由 / 生成器 iframe 桥
   - 顶栏当前场次（SSE 实时）
   - 概览页数据
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- 图标 ---------- */
  const ICONS = {
    overview: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    live: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10 6-3.2v10.4l-6-3.2"/></svg>',
    data: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3.5-4 3 2.5L20 7"/></svg>',
    bracket: '<svg viewBox="0 0 24 24"><path d="M4 5h5v5H4zM4 14h5v5H4zM15 9.5h5v5h-5z"/><path d="M9 7.5h3v9.5h3M9 16.5h3"/></svg>',
    teams: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M16 15.4a4.6 4.6 0 0 1 4.5 3.6"/></svg>',
    hero: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9.5" r="1.4"/><path d="m5 17 4.5-4 3 2.5 2.5-2.5L19 17"/></svg>',
    herostats: '<svg viewBox="0 0 24 24"><path d="M4 20V9"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
    promo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 21h10"/><path d="m6 14 3.5-3 3 2.5 2.5-2.5L18 14"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4 4.5-4"/><path d="M4 18.5h16"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.3"/><path d="M12 17h.01"/></svg>',
  };
  $$(".wk-item").forEach((b) => {
    const host = $(".wk-ico", b);
    if (host && ICONS[b.dataset.icon]) host.innerHTML = ICONS[b.dataset.icon];
  });

  /* ---------- 视图表 ---------- */
  const VIEWS = {
    overview: { title: "概览", sub: "当前工作、OBS 源与赛事状态", pane: "overview", nav: "overview" },
    director: { title: "导播台", sub: "预览、推送与现场操作", pane: "director", nav: "director" },
    spotlight: { title: "宣传轮播", sub: "编辑选手名单、预览并控制直播轮播", pane: "director", nav: "spotlight" },
    data:     { title: "对局数据", sub: "截图识别、五路数据与本局信息", pane: "engine", tab: "data", nav: "data" },
    herostats:{ title: "英雄胜率", sub: "自动生成小组赛赛程 + 手动录入", pane: "herostats", nav: "herostats" },
    season:   { title: "赛季仪表盘", sub: "队伍、英雄池与 BP 分析图", pane: "season", nav: "season" },
    promo:    { title: "赛前宣传图", sub: "群发海报与主视觉", pane: "promo", nav: "promo" },
    bracket:  { title: "淘汰赛赛程", sub: "分组、抽签、赛果与赛程图", pane: "engine", tab: "bracket", nav: "bracket" },
    teams:    { title: "队伍库", sub: "队伍、选手名单与状态", pane: "engine", tab: "teams", nav: "teams" },
    hero:     { title: "英雄图", sub: "英雄素材与识别索引", pane: "engine", tab: "hero", nav: "hero" },
    out:      { title: "多局与导出", sub: "多局对比、打包与下载", pane: "engine", tab: "out", nav: "out" },
    help:     { title: "说明", sub: "操作手册与常见问题", pane: "engine", tab: "help", nav: "help" },
  };
  const ALIAS = { gen: "overview" };

  const railItems = $$(".wk-item");
  const shellRoot = $(".wk-shell");
  const navToggle = $("#wkNavToggle");
  const contextDisclosure = $("#wkContextDisclosure");
  const contextSummary = $("#wkContextDisclosure > summary");
  const contextSummaryText = $("#wkCtxSummary");
  const compactNavMedia = window.matchMedia("(max-width: 1150px)");
  const compactContextMedia = window.matchMedia("(max-width: 1220px)");
  function setNavExpanded(expanded) {
    if (!shellRoot || !navToggle) return;
    shellRoot.classList.toggle("nav-expanded", !!expanded && compactNavMedia.matches);
    navToggle.setAttribute("aria-expanded", String(!compactNavMedia.matches || shellRoot.classList.contains("nav-expanded")));
  }
  function syncResponsiveShell() {
    if (!compactNavMedia.matches && shellRoot) shellRoot.classList.remove("nav-expanded");
    if (navToggle) navToggle.setAttribute("aria-expanded", String(!compactNavMedia.matches || !!(shellRoot && shellRoot.classList.contains("nav-expanded"))));
    if (contextDisclosure) contextDisclosure.open = !compactContextMedia.matches;
  }
  if (navToggle) navToggle.addEventListener("click", () => setNavExpanded(!shellRoot.classList.contains("nav-expanded")));
  if (contextDisclosure) contextDisclosure.addEventListener("toggle", () => {
    const summary = $("summary", contextDisclosure);
    if (summary) summary.setAttribute("aria-expanded", String(contextDisclosure.open));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (contextDisclosure && compactContextMedia.matches && contextDisclosure.open) {
      contextDisclosure.open = false;
      contextSummary && contextSummary.focus();
    }
    if (shellRoot && compactNavMedia.matches && shellRoot.classList.contains("nav-expanded")) {
      setNavExpanded(false);
      navToggle && navToggle.focus();
    }
  });
  if (compactNavMedia.addEventListener) compactNavMedia.addEventListener("change", syncResponsiveShell);
  else compactNavMedia.addListener(syncResponsiveShell);
  if (compactContextMedia.addEventListener) compactContextMedia.addEventListener("change", syncResponsiveShell);
  else compactContextMedia.addListener(syncResponsiveShell);
  syncResponsiveShell();
  const panes = {
    overview: $("#pane-overview"), director: $("#pane-director"),
    engine: $("#pane-engine"), herostats: $("#pane-herostats"),
    season: $("#pane-season"), promo: $("#pane-promo"),
  };
  const frame = $("#genFrame");
  const titleEl = $("#wkTitle");
  const subEl = $("#wkSub");
  let navigationContext = null;
  let lastRemoteSaveNotice = "";

  function viewUrl(name) {
    const params = new URLSearchParams();
    if (name !== "overview") params.set("view", name);
    const ctx = navigationContext || {};
    ["seriesId", "matchKey", "gameId"].forEach((key) => {
      const value = ctx[key] || new URLSearchParams(location.search).get(key) || "";
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return "/" + (query ? "?" + query : "");
  }

  function showPane(name) {
    Object.entries(panes).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("on", k === name);
    });
  }

  function paintNav(nav) {
    railItems.forEach((b) => {
      const current = b.dataset.view === nav;
      b.classList.toggle("on", current);
      if (current) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function setView(name, push) {
    if (ALIAS[name]) name = ALIAS[name];
    const v = VIEWS[name] || VIEWS.overview;
    paintNav(v.nav);
    if (titleEl) titleEl.textContent = v.title;
    if (subEl) subEl.textContent = v.sub;
    if (v.pane === "engine") {
      showPane("engine");
      switchEngine(v.tab);
    } else {
      showPane(v.pane);
    }
    const pv = $("#wkPreviewToggle");
    if (pv) pv.hidden = v.pane !== "engine" || name === "help" || name === "bracket";
    document.title = v.title + " · PKC 赛事工作台";
    window.__wkView = name;
    window.dispatchEvent(new CustomEvent("pkc:view", { detail: { name } }));
    if (push !== false) {
      const url = viewUrl(name);
      try { history.pushState({ view: name }, "", url); } catch {}
    }
  }

  /* ---------- 生成器 iframe ---------- */
  let engineTarget = "";
  let engineRequested = false;
  function engineReady() {
    try {
      const w = frame && frame.contentWindow;
      return !!(w && typeof w.switchTab === "function");
    } catch {
      /* 请求失败的 iframe 可能是跨源错误页，按未就绪处理并允许重试。 */
      return false;
    }
  }
  function ensureEngine(force) {
    if (!frame) return false;
    if (engineReady()) return true;
    const retry = !!force && engineRequested;
    frame.src = "/generator?bare=1" + (retry ? "&retry=" + Date.now() : "");
    engineRequested = true;
    return false;
  }
  function switchEngine(tab) {
    engineTarget = tab;
    ensureEngine(engineRequested);
    let left = 30;
    const tick = () => {
      try {
        const w = frame && frame.contentWindow;
        if (w && typeof w.switchTab === "function") {
          w.switchTab(tab);
          setTimeout(() => {
            const layout = frame.contentDocument && frame.contentDocument.querySelector(".layout");
            const btn = $("#wkPreviewToggle");
            if (btn) btn.textContent = layout && layout.classList.contains("focus") ? "显示预览" : "收起预览";
          }, 260);
          return;
        }
      } catch {
        /* 错误页会在下一轮或用户再次进入时重试。 */
      }
      if (--left <= 0) {
        /* 保持页面可重试：用户再次进入「对局数据」时会重新请求生成器。 */
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  }

  frame && frame.addEventListener("load", () => {
    if (engineTarget && engineReady()) switchEngine(engineTarget);
  });

  /* 生成器内部切换 tab 时回传，侧栏跟随 */
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || d.type !== "pkc:tab") return;
    if (!VIEWS[d.tab]) return;
    if (!panes.engine || !panes.engine.classList.contains("on")) return;
    paintNav(VIEWS[d.tab].nav);
    if (titleEl) titleEl.textContent = VIEWS[d.tab].title;
    if (subEl) subEl.textContent = VIEWS[d.tab].sub;
    window.__wkView = d.tab;
    const pv = $("#wkPreviewToggle");
    if (pv) pv.hidden = d.tab === "help" || d.tab === "bracket";
    try { history.replaceState({ view: d.tab }, "", "/?view=" + d.tab); } catch {}
  });

  railItems.forEach((b) => {
    b.addEventListener("click", () => {
      setView(b.dataset.view, true);
      if (compactNavMedia.matches) setNavExpanded(false);
    });
  });

  /* 数据引擎的右侧预览很占宽，外壳给一个收起 / 显示入口 */
  const pvToggle = $("#wkPreviewToggle");
  if (pvToggle) {
    pvToggle.addEventListener("click", () => {
      const doc = frame && frame.contentDocument;
      const btn = doc && doc.querySelector("#btnPreviewToggle");
      if (!btn) return;
      btn.click();
      const layout = doc.querySelector(".layout");
      const focused = layout && layout.classList.contains("focus");
      pvToggle.textContent = focused ? "显示预览" : "收起预览";
    });
  }
  const ctxChoose = $("#wkCtxChoose");
  if (ctxChoose) ctxChoose.addEventListener("click", () => setView("data", true));
  window.addEventListener("popstate", () => {
    const v = new URLSearchParams(location.search).get("view") || "overview";
    setView(v, false);
  });

  /* ---------- 顶栏当前场次 ---------- */
  let matchCache = null;
  let navigationBracketData = null;
  let stateCache = null;

  function pickCommentaryScore(st) {
    const bags = [
      st && st.onAir && st.onAir.settings && st.onAir.settings.commentary,
      st && st.preview && st.preview.settings && st.preview.settings.commentary,
    ];
    for (const c of bags) {
      const sc = c && c.score;
      if (sc && sc.blue !== undefined && sc.red !== undefined) return sc;
    }
    return null;
  }

  function applyTopbar(st) {
    if (!st) return;
    stateCache = st;
    const ctx = (st.live && st.live.context) || {};
    navigationContext = { seriesId: ctx.seriesId || "", matchKey: ctx.matchKey || "", gameId: ctx.gameId || "" };
    const choose = $("#wkCtxChoose");
    if (choose) choose.hidden = !!(ctx.seriesId && ctx.matchKey && ctx.gameId);
    const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    set("#wkCtxSeries", ctx.seriesName || "未选择系列赛");
    const shortMatch = ctx.matchLabel ? String(ctx.matchLabel).split("·")[0].trim() : "";
    set("#wkCtxMatch", shortMatch || ctx.matchRound || "未关联赛程");
    set("#wkCtxGame", ctx.gameLabel || "—");
    set("#wkBlue", ctx.blueTeam || "蓝方");
    set("#wkRed", ctx.redTeam || "红方");

    let bs = ctx.blueScore, rs = ctx.redScore;
    const games = (matchCache && matchCache.games && matchCache.games[ctx.seriesId]) || [];
    const g = games.find((x) => x.id === ctx.gameId);
    if (g) { bs = g.ourScore; rs = g.oppScore; }
    set("#wkScore", (bs === "" || bs === undefined ? "-" : bs) + " : " + (rs === "" || rs === undefined ? "-" : rs));

    const scene = (st.scenes || []).find((s) => s.id === (st.onAir && st.onAir.scene));
    const liveEl = $("#wkLive");
    if (liveEl) {
      liveEl.classList.toggle("on", !!scene && scene.id !== "blank");
      liveEl.innerHTML = "<i></i>在播：<b>" + (scene ? scene.label : "—") + "</b>";
    }
    if (contextSummaryText) {
      const seriesName = ctx.seriesName || "未选择系列赛";
      const matchName = shortMatch || ctx.matchRound || "未关联赛程";
      const gameName = ctx.gameLabel || "";
      const teamsName = (ctx.blueTeam || "蓝方") + " VS " + (ctx.redTeam || "红方");
      const scoreName = (bs === "" || bs === undefined ? "-" : bs) + " : " + (rs === "" || rs === undefined ? "-" : rs);
      const liveName = scene && scene.id !== "blank" ? "在播 " + scene.label : "未推送";
      contextSummaryText.textContent = [seriesName, matchName, gameName, teamsName, scoreName, liveName].join(" · ");
    }
    paintOverview(st);
  }

  function paintOverview(st) {
    const ctx = (st && st.live && st.live.context) || {};
    const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    set("#ovSeries", ctx.seriesName || "还没有系列赛");
    set("#ovStage", ctx.matchRound || (ctx.matchLabel ? "" : "在「数据 → 赛程」里建立对阵"));
    set("#ovBlue", ctx.blueTeam || "蓝方");
    set("#ovRed", ctx.redTeam || "红方");
    set("#ovGame", ctx.gameLabel || "—");

    const sc = pickCommentaryScore(st);
    const blue = sc ? Number(sc.blue) || 0 : 0;
    const red = sc ? Number(sc.red) || 0 : 0;
    set("#ovScore", blue + " : " + red);
    const bo = sc && sc.bo && sc.bo !== "auto" ? "BO" + sc.bo + " · " : "";
    set("#ovScoreHint", bo + "大场比分");
  }

  const escHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  /** 开播前检查：把最容易翻车的几项直接标出来。 */
  function renderChecks(st, teams, games) {
    const box = $("#ovChecks");
    if (!box) return;
    const ctx = (st && st.live && st.live.context) || {};
    const rows = [];
    const add = (ok, label, value) => rows.push({ ok, label, value });

    add(!!ctx.matchKey, "场次已关联赛程",
      ctx.matchKey ? (String(ctx.matchLabel || "").split("·")[0].trim() || ctx.matchKey) : "未关联");

    const roster = (name) => {
      const t = (teams || []).find((x) => x.name === name);
      return t ? (t.players || []).filter((p) => typeof p === "string" ? !!p : p && p.name).length : 0;
    };
    const bn = roster(ctx.blueTeam);
    const rn = roster(ctx.redTeam);
    const rosterText = (n) => (n >= 5 ? n + " 人" : n + " / 5");
    add(bn >= 5, "蓝方名单", rosterText(bn));
    add(rn >= 5, "红方名单", rosterText(rn));

    const g = (games || []).find((x) => x.id === ctx.gameId);
    const filled = g ? (g.rows || []).filter((r) =>
      (r.our && (r.our.name || r.our.hero)) || (r.opp && (r.opp.name || r.opp.hero))).length : 0;
    add(filled >= 5, "本局数据", filled + " / 5");

    const sc = pickCommentaryScore(st);
    const hasScore = !!(sc && ((Number(sc.blue) || 0) + (Number(sc.red) || 0) > 0));
    add(hasScore, "大场比分", sc ? (Number(sc.blue) || 0) + " : " + (Number(sc.red) || 0) : "未填");

    const scene = (st && (st.scenes || []).find((s) => s.id === (st.onAir && st.onAir.scene)));
    add(!!scene && scene.id !== "blank", "直播画面", scene ? scene.label : "—");

    box.innerHTML = rows.map((r) =>
      '<div class="wk-check-row ' + (r.ok ? "ok" : "warn") + '"><i></i><span>'
      + escHtml(r.label) + '</span><b>' + escHtml(r.value) + '</b><em>' + (r.ok ? "已就绪" : "待处理") + "</em></div>").join("");
    const sum = $("#wkCheckSum");
    if (sum) sum.textContent = rows.filter((r) => r.ok).length + " / " + rows.length + " 就绪";
  }

  function renderWorkflow(series, teams, games, st) {
    const host = $("#wkWorkflow");
    if (!host) return;
    const ctx = (st && st.live && st.live.context) || {};
    navigationContext = {
      seriesId: ctx.seriesId || (series && series.id) || "",
      matchKey: ctx.matchKey || "",
      gameId: ctx.gameId || "",
    };
    const rosterReady = (teams || []).length > 0 && teams.every((team) => (team.players || []).filter(Boolean).length >= 5);
    const bracketData = series && series.id && navigationBracketData && navigationBracketData[series.id] || {};
    const draw = Array.isArray(bracketData.draw) ? bracketData.draw : [];
    const drawReady = draw.length >= 8 && draw.slice(0, 8).every((match) => match && match.a && match.b);
    const selectedGame = (games || []).find((game) => game.id === ctx.gameId);
    const gameReady = !!selectedGame && (selectedGame.rows || []).filter((row) =>
      (row.our && (row.our.name || row.our.hero)) || (row.opp && (row.opp.name || row.opp.hero))).length >= 5;
    const steps = [
      { title:"赛前准备", text:!rosterReady ? "补齐参赛队伍与至少 5 名选手名单。" : (!drawReady ? "检查分组并完成淘汰赛对阵。" : "队伍名单和首轮对阵已就绪。"), view:!rosterReady ? "teams" : "bracket", ready:rosterReady && drawReady, label:!rosterReady ? "完善队伍库" : (!drawReady ? "检查赛程" : "查看赛程") },
      { title:"赛中执行", text:ctx.matchKey ? `当前 ${ctx.matchLabel || ctx.matchKey} · ${ctx.gameLabel || "尚未选择局次"}` : "先从赛程选择场次，再核对队伍和局次。", view:ctx.matchKey ? "data" : "bracket", ready:!!ctx.matchKey && !!ctx.gameId, label:ctx.matchKey ? "打开当前对局" : "选择比赛场次" },
      { title:"赛后整理", text:gameReady ? "当前局数据已录入，可核对赛果并导出图表。" : "录完五路数据后，回填赛果并整理输出。", view:gameReady ? "out" : "data", ready:gameReady, label:gameReady ? "核对并导出" : "继续录入数据" },
    ];
    const nextIndex = ctx.gameId ? (gameReady ? 2 : 1) : (!rosterReady || !drawReady ? 0 : 1);
    host.innerHTML = steps.map((step, index) =>
      '<div class="wk-flow-step' + (index === nextIndex ? ' next' : '') + '"><b>' + escHtml(step.title) + (step.ready ? ' · 已就绪' : ' · 待处理') + (index === nextIndex ? ' <em class="wk-flow-next">建议下一步</em>' : '') + '</b><p>' + escHtml(step.text) + '</p><button class="wk-btn' + (index === nextIndex ? ' primary' : '') + '" data-workflow-go="' + step.view + '">' + escHtml(step.label) + '</button></div>'
    ).join("");
    $$('[data-workflow-go]', host).forEach((button) => button.addEventListener("click", () => setView(button.dataset.workflowGo, true)));
  }

  function renderSceneReadiness(readiness) {
    window.PKC_READINESS = readiness || null;
    const hosts = [$("#ovSceneReadiness"), $("#directorReadiness")].filter(Boolean);
    if (!hosts.length) return;
    if (!readiness || !Array.isArray(readiness.scenes)) {
      hosts.forEach((host) => { host.textContent = "场景预检暂不可用"; });
      return;
    }
    const statusText = { ready: "就绪", warning: "注意", blocked: "阻断" };
    const fallbackView = {
      commentary: "data", interval: "teams", bracket: "bracket",
      chart: "data", spotlight: "director", blank: "",
    };
    hosts.forEach((host) => {
      host.replaceChildren();
      readiness.scenes.forEach((scene) => {
        const row = document.createElement("div");
        row.className = "wk-readiness-item " + scene.status;
        const dot = document.createElement("i");
        const copy = document.createElement("div");
        const title = document.createElement("b");
        title.textContent = scene.label + " · " + statusText[scene.status];
        const summary = document.createElement("span");
        summary.textContent = scene.summary || "";
        summary.title = (scene.blockers || []).map((item) => item.label).join("；") || scene.summary || "";
        copy.append(title, summary);
        const view = scene.blockers?.[0]?.view || fallbackView[scene.id] || "";
        if (view) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = scene.status === "ready" ? "查看" : "去处理";
          button.addEventListener("click", () => setView(view, true));
          row.append(dot, copy, button);
        } else {
          const state = document.createElement("em");
          state.textContent = statusText[scene.status];
          row.append(dot, copy, state);
        }
        host.append(row);
      });
    });
    const sum = $("#wkCheckSum");
    if (sum) sum.textContent = readiness.overall.readyCount + " / " + readiness.overall.total + " 场景就绪";
  }

  function renderRemoteAccess(access) {
    const host = $("#remoteAccessBody");
    const mode = $("#remoteMode");
    if (!host || !mode) return;
    host.replaceChildren();
    if (!access || !access.enabled) {
      mode.textContent = "仅本机";
      host.textContent = "普通模式只监听 127.0.0.1。关闭服务后重新运行「启动.bat」并选择手机远程模式。";
      return;
    }
    mode.textContent = "局域网已开启";
    const url = access.urls?.[0]?.url || "";
    const urlBox = document.createElement("div");
    urlBox.className = "wk-remote-url";
    urlBox.textContent = url || "未检测到局域网地址";
    const pin = document.createElement("div");
    pin.className = "wk-remote-pin";
    pin.textContent = String(access.pin || "").replace(/(\d{3})(\d{3})/, "$1 $2");
    const meta = document.createElement("div");
    meta.className = "wk-remote-meta";
    meta.textContent = "手机与电脑需在同一 HKU Wi-Fi。口令 "
      + new Date(access.pinExpiresAt).toLocaleTimeString("zh-CN", { hour12:false })
      + " 失效 · 已连接 " + access.sessionCount + "/" + access.maxSessions + " 台";
    const actions = document.createElement("div");
    actions.className = "wk-remote-actions";
    const copy = document.createElement("button");
    copy.className = "wk-btn";
    copy.textContent = "复制手机地址";
    copy.disabled = !url;
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(url); copy.textContent = "已复制"; } catch {}
    };
    const refresh = document.createElement("button");
    refresh.className = "wk-btn";
    refresh.textContent = "刷新口令";
    refresh.onclick = async () => {
      refresh.disabled = true;
      try {
        const result = await fetch("/api/remote/refresh-pin", { method:"POST" }).then((response) => response.json());
        if (!result.error) renderRemoteAccess(result);
      } finally { refresh.disabled = false; }
    };
    actions.append(copy, refresh);
    host.append(urlBox, pin, meta, actions);
  }

  function loadOverview() {
    return Promise.all([
      fetch("/api/store/library", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/store/matches", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/director/state", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/ping", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/store/bracket", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/director/readiness", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/remote/access", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(async ([lib, matches, st, ping, brackets, readiness, remoteAccess]) => {
      matchCache = matches;
      navigationBracketData = brackets || {};
      const series = lib && lib.series ? (lib.series.find((s) => s.id === lib.currentId) || lib.series[0]) : null;
      const teamData = series
        ? await fetch("/api/competition/teams?seriesId=" + encodeURIComponent(series.id), { cache: "no-store" }).then((r) => r.json()).catch(() => null)
        : null;
      const games = (matches && matches.games && series && matches.games[series.id]) || [];
      const filled = games.filter((g) => (g.rows || []).some((r) =>
        (r.our && (r.our.name || r.our.hero)) || (r.opp && (r.opp.name || r.opp.hero))));
      const ctx = (st && st.live && st.live.context) || {};
      const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };

      set("#ovTeamCount", String((series && series.teams ? series.teams.length : 0)));
      set("#ovGameCount", String(filled.length));
      const scene = st && (st.scenes || []).find((s) => s.id === (st.onAir && st.onAir.scene));
      set("#ovScene", scene ? scene.label : "—");
      set("#ovPort", ping && ping.port ? ":" + ping.port : "—");
      if (ctx.seriesName) set("#ovSeries", ctx.seriesName);

      const dot = $("#wkDot");
      if (dot) dot.classList.toggle("bad", !ping || !ping.ok);
      const svc = $("#wkService");
      if (svc) svc.textContent = ping && ping.ok ? "本地服务 · " + (ping.port || "") : "服务未连接";

      if (st) applyTopbar(st);
      renderChecks(st, (teamData && teamData.teams) || [], games);
      renderSceneReadiness(readiness);
      renderRemoteAccess(remoteAccess);
      renderWorkflow(series, (teamData && teamData.teams) || [], games, st);
    });
  }

  /* ---------- SSE ---------- */
  function connectStream() {
    try {
      const es = new EventSource("/api/director/stream");
      const onData = (e) => {
        try {
          const st = JSON.parse(e.data);
          applyTopbar(st);
          const savedAt = st?.live?.context?.remoteSavedAt || "";
          if (savedAt && savedAt !== lastRemoteSaveNotice) {
            lastRemoteSaveNotice = savedAt;
            try {
              frame?.contentWindow?.postMessage({
                type:"pkc:remote-data-saved",
                context:st.live.context,
              }, location.origin);
            } catch {}
          }
          if (panes.overview && panes.overview.classList.contains("on")) loadOverview();
        } catch {}
      };
      ["hello", "live", "onAir", "preview"].forEach((ev) => es.addEventListener(ev, onData));
      es.addEventListener("error", () => {
        const dot = $("#wkDot");
        if (dot) dot.classList.add("bad");
        const svc = $("#wkService");
        if (svc) svc.textContent = "与导播台断开，重连中…";
      });
      es.addEventListener("open", () => {
        const dot = $("#wkDot");
        if (dot) dot.classList.remove("bad");
        loadOverview();
      });
    } catch {}
  }

  /* ---------- 复制 OBS 地址 ---------- */
  $$("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const path = b.dataset.copy;
      const url = location.origin + path;
      try {
        await navigator.clipboard.writeText(url);
        b.textContent = "已复制";
        b.classList.add("ok");
        setTimeout(() => { b.textContent = "复制"; b.classList.remove("ok"); }, 1200);
      } catch {
        b.textContent = "复制失败";
        setTimeout(() => { b.textContent = "复制"; }, 1200);
      }
    });
  });

  /* 概览里的跳转按钮 */
  $$("[data-go]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      setView(b.dataset.go, true);
    });
  });

  /* ---------- 启动 ---------- */
  const qView = new URLSearchParams(location.search).get("view");
  const initial = qView
    || (location.pathname.replace(/\/+$/, "") === "/director" ? "director" : "overview");
  setView(initial, false);
  loadOverview();
  connectStream();
  setInterval(() => {
    if (panes.overview && panes.overview.classList.contains("on")) loadOverview();
  }, 30000);
})();
