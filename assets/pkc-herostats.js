/* ============================================================
   PKC · 英雄胜率页
   - 读取 /api/hero-stats，渲染英雄榜 / 选手英雄池 / 待确认
   - 一键启动赛宝抓取，轮询进度
   - 聚类头像自动建议 + 一次确认后全赛事生效
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const pct = (v) => (v == null ? "—" : v.toFixed(1) + "%");
  const state = {
    raw: null, agg: null, tab: "heroes",
    sort: { key: "picks", dir: -1 },
    heroNames: [], features: null, libraryTeams: [], poll: null, busy: false,
    showAll: false, reviewKind: "all",
  };

  function filters() {
    return {
      stage: $("#fStage").value || "循环赛",
      group: $("#fGroup").value || "all",
      team: $("#fTeam").value || "all",
      player: $("#fPlayer").value || "all",
      minPicks: $("#fMin").value || "3",
    };
  }
  function qs(f) {
    const q = new URLSearchParams();
    Object.entries(f || filters()).forEach(([k, v]) => { if (v !== "" && v != null) q.set(k, v); });
    return q.toString();
  }

  async function getJSON(url, opts) {
    const r = await fetch(url, opts);
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch { throw new Error(t.slice(0, 300)); }
    if (!r.ok) throw new Error(j && j.error || ("HTTP " + r.status));
    return j;
  }

  async function loadAll(keepFilters) {
    const f = filters();
    const [raw, agg] = await Promise.all([
      getJSON("/api/hero-stats/raw"),
      getJSON("/api/hero-stats?" + qs(f)),
    ]);
    state.raw = raw;
    state.agg = agg;
    renderFilters(keepFilters);
    renderAll();
    suggestClusters();
  }

  function renderFilters(keep) {
    const agg = state.agg;
    if (!agg) return;
    const prevValues = {
      stage: $("#fStage").value,
      group: $("#fGroup").value,
      team: $("#fTeam").value,
      player: $("#fPlayer").value,
    };
    const set = (sel, values, current, allLabel) => {
      const el = $(sel);
      const prev = keep ? current : "";
      el.innerHTML = "";
      if (allLabel) el.appendChild(new Option(allLabel, "all"));
      for (const v of values || []) el.appendChild(new Option(v, v));
      if (prev && Array.from(el.options).some((o) => o.value === prev)) el.value = prev;
      else if (el.options.length) el.selectedIndex = 0;
    };
    const stages = agg.options.stages.length ? agg.options.stages : ["循环赛"];
    set("#fStage", stages, prevValues.stage, "全部阶段");
    set("#fGroup", agg.options.groups, prevValues.group, "全部组别");
    set("#fTeam", agg.options.teams, prevValues.team, "全部队伍");
    set("#fPlayer", (agg.players || []).map((p) => p.name), prevValues.player, "全部选手");
    if (!keep) {
      $("#fStage").value = agg.stage && agg.stage !== "all" ? agg.stage : "all";
      $("#fGroup").value = "all";
      $("#fTeam").value = "all";
      $("#fPlayer").value = "all";
    }
  }

  function renderAll() {
    const a = state.agg;
    if (!a) return;
    $("#kSeries").textContent = a.summary.series || 0;
    $("#kGames").textContent = a.summary.games || 0;
    $("#kPicks").textContent = a.summary.picks || 0;
    $("#kHeroes").textContent = a.summary.heroes || 0;
    const pending = pendingClusters().length;
    $("#kPending").textContent = pending;
    $("#reviewCount").textContent = pending;
    renderHeroes();
    renderPlayers();
    renderReview();
    renderManualOptions();
    renderLog();
  }

  function sortRows(rows) {
    const { key, dir } = state.sort;
    return rows.slice().sort((x, y) => {
      const a = x[key], b = y[key];
      if (typeof a === "number" || typeof b === "number") {
        return ((a ?? -1) - (b ?? -1)) * dir;
      }
      return String(a ?? "").localeCompare(String(b ?? ""), "zh-CN") * dir;
    });
  }

  function renderHeroes() {
    const a = state.agg;
    const rows = sortRows(a.heroes || []);
    if (!rows.length) {
      const hint = a.summary && a.summary.picks > 0
        ? `当前筛选（出场 ≥${$("#fMin").value}）下没有英雄；把右上角筛选切到「全部英雄」就能看到这 ${a.summary.picks} 次出场。`
        : "还没有英雄数据。点上面的「开始抓取」跑一遍小组赛，或在「抓取日志」里看当前进度。";
      $("#viewHeroes").innerHTML = `<div class="empty">${hint}</div>`;
      return;
    }
    const th = (key, label, num) =>
      `<th class="${num ? "num" : ""}" data-sort="${key}">${label}${state.sort.key === key ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`;
    $("#viewHeroes").innerHTML = `
      <table>
        <thead><tr>
          ${th("hero", "英雄")}${th("picks", "出场", 1)}${th("wins", "胜场", 1)}
          ${th("winRate", "胜率", 1)}${th("bans", "禁用", 1)}
          ${th("pickRate", "pick 率", 1)}${th("banRate", "ban 率", 1)}${th("presenceRate", "presence", 1)}
        </tr></thead>
        <tbody>${rows.map((h) => `
          <tr>
            <td><b>${esc(h.hero)}</b></td>
            <td class="num">${h.picks}</td>
            <td class="num">${h.wins}</td>
            <td class="num"><span class="rate ${h.winRate >= 50 ? "hi" : "lo"}">${pct(h.winRate)}</span></td>
            <td class="num">${h.bans}</td>
            <td class="num">${pct(h.pickRate)}</td>
            <td class="num">${pct(h.banRate)}</td>
            <td class="num">${pct(h.presenceRate)}</td>
          </tr>`).join("")}</tbody>
      </table>
      <div class="hint">口径：只有双方各 5 个选择、10 个英雄互不重复、且有胜负的局才进分母；判负/弃权局不计入。</div>`;
    $$("#viewHeroes th[data-sort]").forEach((el) => {
      el.onclick = () => {
        const k = el.dataset.sort;
        state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
        renderHeroes();
      };
    });
  }

  function renderPlayers() {
    const a = state.agg;
    const rows = [];
    for (const p of a.players || []) {
      for (const h of p.heroes || []) {
        rows.push({ player: p.name, team: p.team, hero: h.hero, games: h.games, wins: h.wins, winRate: h.winRate, playerGames: p.games });
      }
    }
    if (!rows.length) {
      $("#viewPlayers").innerHTML = '<div class="empty">还没有选手对应数据。抓取时会同时读备战页底部的选手行；如果选手头像无法唯一匹配，会先留空。</div>';
      return;
    }
    rows.sort((x, y) => y.playerGames - x.playerGames || y.games - x.games || x.player.localeCompare(y.player, "zh-CN"));
    $("#viewPlayers").innerHTML = `
      <table>
        <thead><tr><th>选手</th><th>队伍</th><th>英雄</th><th class="num">场次</th><th class="num">胜场</th><th class="num">胜率</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><b>${esc(r.player)}</b></td><td>${esc(r.team)}</td><td>${esc(r.hero)}</td>
            <td class="num">${r.games}</td><td class="num">${r.wins}</td>
            <td class="num"><span class="rate ${r.winRate >= 50 ? "hi" : "lo"}">${pct(r.winRate)}</span></td>
          </tr>`).join("")}</tbody>
      </table>`;
  }

  function latestSession() {
    const s = state.raw && state.raw.sessions && state.raw.sessions[0];
    return s ? s.name : "";
  }
  function sampleUrl(hash) {
    const c = state.raw && state.raw.clusters ? state.raw.clusters[hash] : null;
    const sample = c && c.sample ? String(c.sample) : "";
    if (/^(https?:)?\//.test(sample)) return sample;
    const sess = latestSession();
    if (!sess) return "";
    if (sample) return "/capture/" + encodeURIComponent(sess) + "/" + sample.replace(/^\/+/, "");
    return "/capture/" + encodeURIComponent(sess) + "/icons/" + encodeURIComponent(hash) + ".png";
  }

  function pendingClusters() {
    const raw = state.raw;
    if (!raw || !raw.clusters) return [];
    const counts = new Map();
    for (const [hash, c] of Object.entries(raw.clusters)) {
      if (c && c.hero) counts.set(c.hero, (counts.get(c.hero) || 0) + 1);
    }
    return Object.entries(raw.clusters)
      .filter(([hash, c]) => {
        if (!c) return false;
        if (state.reviewKind !== "all" && c.kind !== state.reviewKind) return false;
        if (state.showAll) return true;
        return !c.confirmed || !c.hero || (counts.get(c.hero) || 0) > 1;
      })
      .map(([hash, c]) => ({ hash, ...c, duplicate: c.hero && (counts.get(c.hero) || 0) > 1 }))
      .sort((a, b) => (a.kind === "ban" ? 1 : 0) - (b.kind === "ban" ? 1 : 0) || (b.count || 0) - (a.count || 0));
  }

  function renderReview() {
    const list = pendingClusters();
    if (!state.raw || !state.raw.clusters || !Object.keys(state.raw.clusters).length) {
      $("#viewReview").innerHTML = '<div class="empty">还没有抓取结果。</div>';
      return;
    }
    if (!list.length) {
      $("#viewReview").innerHTML = '<div class="empty">所有头像都已确认，统计口径已经稳定。</div>';
      return;
    }
    $("#viewReview").innerHTML = `
      <div class="toolbar">
        <div class="muted">共 ${list.length} 个头像；每个头像只需人工输入一次，全赛事同头像出场自动套用。</div>
        <div>
          <select id="reviewKind">
            <option value="all"${state.reviewKind === "all" ? " selected" : ""}>全部</option>
            <option value="pick"${state.reviewKind === "pick" ? " selected" : ""}>只看选择</option>
            <option value="ban"${state.reviewKind === "ban" ? " selected" : ""}>只看禁用</option>
          </select>
          <label class="muted" style="margin:0 8px"><input type="checkbox" id="reviewAll"${state.showAll ? " checked" : ""}> 显示已确认</label>
          <button class="btn primary" id="btnSaveAll">保存全部输入</button>
        </div>
      </div>
      <div class="grid">${list.map((c) => {
        return `<div class="cluster ${c.confirmed ? "done" : "pending"}" data-hash="${esc(c.hash)}">
          <img src="${esc(sampleUrl(c.hash))}" alt="" loading="lazy">
          <div class="meta">
            <b>${esc(c.hero || "未命名")} <span class="tag ${c.kind === "ban" ? "warn" : ""}">${c.kind === "ban" ? "禁用" : "选择"}</span></b>
            <span>出现 ${c.count || 0} 次${c.duplicate ? " · 英雄名重复" : ""}</span>
            <input list="heroNames" value="${esc(c.hero || "")}" placeholder="输入英雄名" data-hash="${esc(c.hash)}">
          </div>
        </div>`;
      }).join("")}</div>
      <datalist id="heroNames">${state.heroNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="hint">输入后失焦即保存；也可以一次填多项再点「保存全部输入」。同名英雄出现在两个头像簇时会提示重复，说明这两个头像需要分别确认。</div>`;
    $$("#viewReview input[data-hash]").forEach((el) => {
      el.onchange = () => {
        const hero = el.value.trim();
        if (!hero) return;
        saveLabels({ [el.dataset.hash]: { hero, confirmed: true, source: "manual" } });
      };
    });
    $("#reviewKind").onchange = (e) => { state.reviewKind = e.target.value; renderReview(); };
    $("#reviewAll").onchange = (e) => { state.showAll = e.target.checked; renderReview(); };
    $("#btnSaveAll").onclick = () => {
      const labels = {};
      $$("#viewReview input[data-hash]").forEach((el) => {
        const hero = el.value.trim();
        if (hero) labels[el.dataset.hash] = { hero, confirmed: true, source: "manual" };
      });
      if (!Object.keys(labels).length) return alert("还没有输入英雄名");
      saveLabels(labels);
    };
  }

  async function saveLabels(labels) {
    try {
      await getJSON("/api/hero-stats/labels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels }),
      });
      await loadAll(true);
    } catch (e) {
      alert("保存失败：" + e.message);
    }
  }

  function renderLog() {
    const status = state.status || {};
    $("#viewLog").innerHTML = `
      <div class="toolbar">
        <div class="muted">会话：${esc(status.session || "—")} · 阶段：${esc(status.phase || "idle")}</div>
        <button class="btn" id="btnIngest">把最近一次结果并入数据</button>
      </div>
      <pre class="log">${esc(status.logTail || "还没有日志。点「开始抓取」后这里会实时显示。")}</pre>`;
    const b = $("#btnIngest");
    if (b) b.onclick = async () => {
      try {
        const out = await getJSON("/api/hero-stats/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        alert("已并入：" + out.series + " 场 / " + out.clusters + " 个头像簇");
        await loadAll(true);
      } catch (e) { alert("并入失败：" + e.message); }
    };
  }

  function switchTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((b) => {
      const current = b.dataset.tab === tab;
      b.classList.toggle("on", current);
      b.setAttribute("aria-pressed", String(current));
    });
    $("#viewHeroes").hidden = tab !== "heroes";
    $("#viewPlayers").hidden = tab !== "players";
    $("#viewReview").hidden = tab !== "review";
    $("#viewManual").hidden = tab !== "manual";
    $("#viewLog").hidden = tab !== "log";
  }

  /* ---------- 手动录入 ---------- */
  async function loadLibrary() {
    try {
      const lib = await getJSON("/api/store/library");
      const series = (lib.series || []).find((s) => s.id === lib.currentId) || (lib.series || [])[0];
      const roster = series ? await getJSON("/api/competition/teams?seriesId=" + encodeURIComponent(series.id)) : { teams: [] };
      state.libraryTeams = (roster.teams || []).map((t) => ({
        name: String(t.name || ""),
        color: String(t.color || ""),
        availableForSelection: t.availableForSelection !== false,
        players: Array.isArray(t.players) ? t.players.map((p) => String(p || "")).filter(Boolean) : [],
      })).filter((t) => t.name);
      renderManualOptions();
    } catch { /* 队伍库不可用时仍可自由输入 */ }
  }

  function fillPlayerOptions(side) {
    const input = $(side === "Left" ? "#mTeamLeft" : "#mTeamRight");
    const list = $(side === "Left" ? "#playerNamesLeft" : "#playerNamesRight");
    if (!input || !list) return;
    const team = state.libraryTeams.find((t) => t.name === input.value.trim() && t.availableForSelection);
    list.innerHTML = team ? team.players.map((n) => `<option value="${esc(n)}">`).join("") : "";
    if (!team) return;
    const last = input.dataset.lastTeam || "";
    if (last === team.name) return;
    input.dataset.lastTeam = team.name;
    const names = team.players.slice(0, 5);
    $$(`#mPicks${side} .pname`).forEach((el, i) => {
      if (!el.value.trim() || team.players.includes(el.value.trim())) el.value = names[i] || "";
    });
  }

  function renderManualOptions() {
    const heroes = $("#heroNamesManual");
    if (heroes) heroes.innerHTML = state.heroNames.map((n) => `<option value="${esc(n)}">`).join("");
    const teams = $("#teamNames");
    if (teams) {
      const names = state.libraryTeams.length
        ? state.libraryTeams.filter((t) => t.availableForSelection).map((t) => t.name)
        : (state.agg && state.agg.options ? state.agg.options.teams : []);
      teams.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
    }
  }

  function renderManual() {
    const build = (side) => {
      const bans = $(`#mBans${side}`);
      const picks = $(`#mPicks${side}`);
      if (!bans || !picks || bans.children.length) return;
      for (let i = 0; i < 5; i++) {
        const b = document.createElement("div");
        b.className = "manual-ban";
        b.innerHTML = `<input list="heroNamesManual" placeholder="空 ban ${i + 1}（可不填）">`;
        bans.appendChild(b);
        const p = document.createElement("div");
        p.className = "manual-pick";
        p.innerHTML = `<input class="pname" list="playerNames${side}" placeholder="选手 ${i + 1}"><input class="phero" list="heroNamesManual" placeholder="英雄">`;
        picks.appendChild(p);
      }
    };
    build("Left");
    build("Right");
    renderManualOptions();
  }

  function collectManualSide(side) {
    const bans = $$(`#mBans${side} input`).map((e) => e.value.trim()).filter(Boolean);
    const players = $$(`#mPicks${side} .manual-pick`).map((row) => ({
      name: row.querySelector(".pname").value.trim(),
      hero: row.querySelector(".phero").value.trim(),
    }));
    return { bans, players };
  }

  async function saveManual() {
    const teamLeft = $("#mTeamLeft").value.trim();
    const teamRight = $("#mTeamRight").value.trim();
    if (!teamLeft || !teamRight) return alert("左右队名都要填");
    const left = collectManualSide("Left");
    const right = collectManualSide("Right");
    if (left.players.some((p) => !p.hero) || right.players.some((p) => !p.hero)) {
      return alert("双方各 5 个选择英雄都要填");
    }
    const body = {
      stage: $("#mStage").value.trim() || "循环赛",
      group: $("#mGroup").value.trim(),
      round: $("#mRound").value.trim(),
      date: $("#mDate").value.trim(),
      gameNo: Number($("#mGameNo").value) || 1,
      teamLeft, teamRight,
      winner: $("#mWinner").value,
      left, right,
    };
    try {
      const out = await getJSON("/api/hero-stats/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      alert(`已保存：${out.seriesId} 第 ${out.gameNo} 局${out.replaced ? "（覆盖了已有同局）" : ""}`);
      const n = Number($("#mGameNo").value) || 1;
      $("#mGameNo").value = Math.min(7, n + 1);
      $$("#mBansLeft input,#mBansRight input,#mPicksLeft .phero,#mPicksRight .phero").forEach((e) => { e.value = ""; });
      await loadAll(true);
    } catch (e) {
      alert("保存失败：" + e.message);
    }
  }

  async function clearManual() {
    const yes = prompt("这会清空全部英雄胜率数据（包括抓取和手动录入）。\n确认请输入「清除」：");
    if (yes !== "清除") return;
    try {
      await getJSON("/api/hero-stats/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "清除" }),
      });
      alert("已清空。");
      await loadAll(false);
    } catch (e) {
      alert("清空失败：" + e.message);
    }
  }

  /* ---------- 头像聚类建议 ---------- */
  function loadHeroFeatures() {
    return new Promise((resolve) => {
      if (window.HERO_ICON) return resolve(window.HERO_ICON);
      if (document.querySelector('script[data-hero-features]')) {
        const t = setInterval(() => { if (window.HERO_ICON) { clearInterval(t); resolve(window.HERO_ICON); } }, 120);
        setTimeout(() => { clearInterval(t); resolve(window.HERO_ICON || null); }, 5000);
        return;
      }
      const s = document.createElement("script");
      s.src = "/assets/hero-features.js";
      s.dataset.heroFeatures = "1";
      s.onload = () => resolve(window.HERO_ICON || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  function decodeFeatures(g) {
    if (!g || !g.data) return null;
    const bin = atob(g.data);
    const arr = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = (bin.charCodeAt(i) << 24) >> 24;
    return { names: g.names, n: g.n, data: arr, dim: g.n * g.n * 3, scale: g.scale || 1 };
  }

  function iconFeature(img, n) {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const px = n * n;
    const mean = [0, 0, 0];
    for (let i = 0; i < px; i++) for (let k = 0; k < 3; k++) mean[k] += d[i * 4 + k];
    for (let k = 0; k < 3; k++) mean[k] /= px;
    const sd = [0, 0, 0];
    for (let i = 0; i < px; i++) for (let k = 0; k < 3; k++) {
      const v = d[i * 4 + k] - mean[k]; sd[k] += v * v;
    }
    for (let k = 0; k < 3; k++) sd[k] = Math.sqrt(sd[k] / px) + 1e-6;
    const f = new Float32Array(px * 3);
    for (let i = 0; i < px; i++) for (let k = 0; k < 3; k++) f[i * 3 + k] = (d[i * 4 + k] - mean[k]) / sd[k];
    return f;
  }

  function matchIcon(feat, featData) {
    const { n, data, dim, scale, names } = featData;
    let best = -1e9, second = -1e9, bi = -1;
    for (let h = 0; h < names.length; h++) {
      const off = h * dim;
      let dot = 0;
      for (let i = 0; i < dim; i++) dot += feat[i] * data[off + i];
      if (dot > best) { second = best; best = dot; bi = h; }
      else if (dot > second) second = dot;
    }
    return { hero: names[bi], score: best / dim * 3 / scale, margin: (best - second) / dim * 3 / scale };
  }

  async function suggestClusters() {
    const g = await loadHeroFeatures();
    if (!g) return;
    state.heroNames = g.names.slice();
    renderManualOptions();
    if (state.tab === "review") renderReview();
  }

  /* ---------- 抓取控制 ---------- */
  function showCaptureMessage(message, assertive) {
    const el = $("#capMsg");
    if (!el) return;
    if (el.textContent !== message) el.textContent = message;
    el.setAttribute("aria-live", assertive ? "assertive" : "polite");
  }
  function setCaptureUi(status) {
    state.status = status;
    const running = !!status.running;
    const active = running || !!status.processing;
    $("#btnStart").disabled = active;
    $("#btnPause").disabled = !running;
    $("#btnStop").disabled = !running;
    $("#btnPause").textContent = status.paused ? "继续" : "暂停";
    const p = status.progress || {};
    const pctVal = p.percent != null ? Math.max(0, Math.min(100, p.percent))
      : (p.seriesIndex && p.seriesTotal ? Math.round(p.seriesIndex / p.seriesTotal * 100) : 0);
    $("#capBar").style.width = pctVal + "%";
    $("#capProgress").setAttribute("aria-valuenow", String(pctVal));
    const bits = [];
    const phaseLabels = {
      capturing: "正在抓取", processing: "正在整理头像并导入数据",
      done: "抓取和导入已完成", stopped: "抓取已停止，已整理已完成场次",
      failed: "后处理失败",
    };
    if (status.phase && phaseLabels[status.phase]) bits.push(phaseLabels[status.phase]);
    else if (p.phase) bits.push(p.phase);
    if (p.group) bits.push(p.group);
    if (p.seriesIndex && p.seriesTotal) bits.push(`第 ${p.seriesIndex}/${p.seriesTotal} 场`);
    if (p.game) bits.push(`第 ${p.game} 局`);
    if (p.message) bits.push(p.message);
    if (status.error) bits.push("失败：" + status.error);
    const capMsg = $("#capMsg");
    const nextMessage = bits.join(" · ") || status.message || "还没有抓取记录";
      if (capMsg.textContent !== nextMessage) capMsg.textContent = nextMessage;
    capMsg.setAttribute("aria-live", active ? "off" : "polite");
    if (state.tab === "log") renderLog();
  }

  async function pollStatus() {
    try {
      const s = await getJSON("/api/saibao/capture/status");
      const wasActive = state.status && (state.status.running || state.status.processing);
      setCaptureUi(s);
      const active = s.running || s.processing;
      if (!active && wasActive) await loadAll(true);
    } catch (error) {
      showCaptureMessage("读取抓取状态失败：" + error.message + "。服务恢复后会自动重试。", false);
    }
  }

  async function startCapture() {
    if (state.busy) return;
    const groups = $("#capGroups").value.trim() || "1,2,3,4";
    const maxSeries = Number($("#capMax").value) || 0;
    const quiet = $("#capQuiet").checked;
    const tip = quiet
      ? "安静模式会尽量不抢前台，但每次点击鼠标会短暂跳到赛宝位置再回来；赛宝窗口请保持在屏幕左侧。\n\n"
      : "会接管前台约 15–20 分钟，期间请不要操作赛宝窗口。\n\n";
    if (!confirm(tip + "抓取过程只读，绝不会点「重置比赛」或「改判比分」。开始吗？")) return;
    state.busy = true;
    try {
      const out = await getJSON("/api/saibao/capture/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups, maxSeries, quiet }),
      });
      if (!out.ok) throw new Error(out.error || "启动失败");
      switchTab("log");
      await pollStatus();
    } catch (e) {
      showCaptureMessage("启动失败：" + e.message + "。检查本地服务后可重试。", true);
    } finally {
      state.busy = false;
    }
  }

  /* ---------- 导出 ---------- */
  function exportCsv() {
    const a = document.createElement("a");
    a.href = "/api/hero-stats/export.csv?" + qs();
    a.download = "hero-stats.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportPng() {
    const a = state.agg;
    const rows = (a && a.heroes ? a.heroes : []).slice(0, 15);
    if (!rows.length) return alert("还没有英雄数据");
    const W = 1600, H = 900, pad = 54;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#0b1222"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#fff"; x.font = "700 44px Microsoft YaHei, sans-serif";
    x.fillText("英雄胜率 · " + (a.event || ""), pad, 78);
    x.fillStyle = "#8fa6d8"; x.font = "20px Microsoft YaHei, sans-serif";
    x.fillText(`${a.stage === "all" ? "全部阶段" : a.stage} · 有效局 ${a.summary.games} · 出场 ${a.summary.picks}`, pad, 116);
    const top = 170, rowH = Math.min(44, (H - top - 50) / rows.length);
    const max = Math.max(1, ...rows.map((r) => r.picks));
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      x.fillStyle = i % 2 ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.05)";
      x.fillRect(pad, y, W - pad * 2, rowH - 6);
      x.fillStyle = "#fff"; x.font = "600 19px Microsoft YaHei, sans-serif";
      x.fillText(`${i + 1}  ${r.hero}`, pad + 14, y + rowH * .66);
      const bx = pad + 330, bw = W - bx - 260;
      x.fillStyle = "rgba(255,255,255,.10)"; x.fillRect(bx, y + rowH * .28, bw, rowH * .42);
      const grad = x.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, "#2f6bff"); grad.addColorStop(1, "#7db0ff");
      x.fillStyle = grad; x.fillRect(bx, y + rowH * .28, bw * (r.picks / max), rowH * .42);
      x.fillStyle = "#cfe0ff"; x.font = "600 18px Consolas, monospace";
      x.fillText(`${r.picks} 场`, bx + bw + 16, y + rowH * .64);
      x.fillStyle = r.winRate >= 50 ? "#54e0a3" : "#ff7b8a";
      x.fillText(`${r.winRate == null ? "—" : r.winRate.toFixed(1) + "%"}`, bx + bw + 100, y + rowH * .64);
    });
    x.fillStyle = "#6f86b8"; x.font = "15px Microsoft YaHei, sans-serif";
    x.fillText("数据来源：王者赛宝 · 只统计有完整备战阵容的真实对局", pad, H - 22);
    c.toBlob((b) => {
      const url = URL.createObjectURL(b);
      const aEl = document.createElement("a");
      aEl.href = url; aEl.download = "hero-winrate.png";
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  /* ---------- 事件 ---------- */
  function bind() {
    renderManual();
    $("#mSave").onclick = saveManual;
    $("#mClear").onclick = clearManual;
    $("#mTeamLeft").onchange = () => fillPlayerOptions("Left");
    $("#mTeamRight").onchange = () => fillPlayerOptions("Right");
    $$(".tab").forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
    $("#fStage").onchange = () => loadAll(false);
    $("#fGroup").onchange = () => loadAll(true);
    $("#fTeam").onchange = () => loadAll(true);
    $("#fPlayer").onchange = () => loadAll(true);
    $("#fMin").onchange = () => loadAll(true);
    $("#btnRefresh").onclick = () => loadAll(true);
    $("#btnCsv").onclick = exportCsv;
    $("#btnPng").onclick = exportPng;
    $("#btnStart").onclick = startCapture;
    $("#btnPause").onclick = async () => {
      const s = state.status || {};
      try {
        await getJSON(s.paused ? "/api/saibao/capture/resume" : "/api/saibao/capture/pause", { method: "POST" });
        await pollStatus();
      } catch (e) { showCaptureMessage("更新抓取状态失败：" + e.message + "。服务恢复后可重试。", true); }
    };
    $("#btnStop").onclick = async () => {
      if (!confirm("停止抓取？已完成的场次会保留。")) return;
      try { await getJSON("/api/saibao/capture/stop", { method: "POST" }); await pollStatus(); }
      catch (e) { showCaptureMessage("停止失败：" + e.message + "。服务恢复后可重试。", true); }
    };
  }

  bind();
  loadLibrary();
  loadAll(false).then(pollStatus).catch((e) => {
    document.querySelector(".wrap").insertAdjacentHTML("afterbegin", `<div class="panel" role="alert" style="padding:14px;color:#b52b3a">加载失败：${esc(e.message)}</div>`);
  });
  state.poll = setInterval(pollStatus, 1500);
})();
