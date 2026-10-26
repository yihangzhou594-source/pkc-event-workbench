/* PKC · 英雄胜率：手动录入、上传局自动同步、赛事禁用手填与榜单 */
(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const rateText = (value) => value == null ? "—" : `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;
  const topHeroText = (row) => row ? `${row.hero}（胜率${rateText(row.winRate)}）` : "—";
  const topTeamText = (row) => row
    ? `${row.name}（使用${row.games}场，胜率${rateText(row.winRate)}）`
    : "—";
  const teamText = (team) => team
    ? `${team.name}${team.eliminated ? "（已淘汰）" : ""}`
    : "—";

  const state = {
    raw: null,
    agg: null,
    schedule: null,
    tab: "heroes",
    sort: { key: "picks", dir: -1 },
    heroNames: [],
    libraryTeams: [],
    selectedMatchId: "",
    uploaded: null,
    selectedUploadedId: "",
    busy: false,
  };

  function filters() {
    return {
      stage: $("#fStage").value || "淘汰赛",
      group: $("#fGroup").value || "all",
      team: $("#fTeam").value || "all",
      minPicks: $("#fMin").value || "0",
    };
  }

  function qs(filter = filters()) {
    const query = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== "" && value != null) query.set(key, value);
    });
    return query.toString();
  }

  async function getJSON(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 300)); }
    if (!response.ok) throw new Error(data && data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadAll(keepFilters) {
    const seriesQuery = state.schedule?.seriesId
      ? "?seriesId=" + encodeURIComponent(state.schedule.seriesId)
      : "";
    const [raw, agg, uploaded] = await Promise.all([
      getJSON("/api/hero-stats/raw" + seriesQuery),
      getJSON("/api/hero-stats?" + qs()),
      getJSON("/api/hero-stats/matches" + seriesQuery),
    ]);
    state.raw = raw;
    state.agg = agg;
    state.uploaded = uploaded;
    renderFilters(keepFilters);
    renderAll();
  }

  function renderFilters(keep) {
    const agg = state.agg;
    if (!agg) return;
    const previous = {
      stage: $("#fStage").value,
      group: $("#fGroup").value,
      team: $("#fTeam").value,
    };
    const fill = (selector, values, current, allLabel) => {
      const select = $(selector);
      const wanted = keep ? current : "";
      select.innerHTML = "";
      if (allLabel) select.appendChild(new Option(allLabel, "all"));
      for (const value of values || []) select.appendChild(new Option(value, value));
      if (wanted && Array.from(select.options).some((option) => option.value === wanted)) {
        select.value = wanted;
      } else if (select.options.length) {
        select.selectedIndex = 0;
      }
    };
    fill("#fStage", agg.options.stages.length ? agg.options.stages : ["循环赛"], previous.stage, "全部阶段");
    fill("#fGroup", agg.options.groups, previous.group, "全部组别");
    fill("#fTeam", agg.options.teams, previous.team, "全部队伍");
    if (!keep) {
      $("#fStage").value = agg.stage && agg.stage !== "all" ? agg.stage : "all";
      $("#fGroup").value = "all";
      $("#fTeam").value = "all";
    }
  }

  function renderAll() {
    const agg = state.agg;
    if (!agg) return;
    $("#kSeries").textContent = agg.summary.series || 0;
    $("#kGames").textContent = agg.summary.games || 0;
    $("#kPicks").textContent = agg.summary.picks || 0;
    $("#kHeroes").textContent = agg.summary.heroes || 0;
    renderHeroes();
    renderTeams();
    renderHeroRanking();
    renderMatchOptions();
    renderManualOptions();
    renderUploadedOptions();
  }

  function sortRows(rows) {
    const { key, dir } = state.sort;
    return rows.slice().sort((left, right) => {
      const a = left[key];
      const b = right[key];
      if (typeof a === "number" || typeof b === "number") {
        return ((a ?? -1) - (b ?? -1)) * dir;
      }
      return String(a ?? "").localeCompare(String(b ?? ""), "zh-CN") * dir;
    });
  }

  function renderHeroes() {
    const agg = state.agg;
    const rows = sortRows(agg.heroes || []);
    if (!rows.length) {
      $("#viewHeroes").innerHTML = '<div class="empty">还没有英雄数据。请先在「对局数据」上传完整对局，或在「手动录入」填写一场比赛。</div>';
      return;
    }
    const heading = (key, label, numeric) =>
      `<th class="${numeric ? "num" : ""}" data-sort="${key}">${label}${state.sort.key === key ? (state.sort.dir < 0 ? " ↓" : " ↑") : ""}</th>`;
    $("#viewHeroes").innerHTML = `
      <table>
        <thead><tr>
          ${heading("hero", "英雄")}${heading("picks", "出场", 1)}${heading("wins", "胜场", 1)}
          ${heading("winRate", "胜率", 1)}${heading("bans", "禁用", 1)}
          ${heading("pickRate", "pick 率", 1)}${heading("banRate", "ban 率", 1)}${heading("presenceRate", "presence", 1)}
        </tr></thead>
        <tbody>${rows.map((hero) => `
          <tr>
            <td><b>${esc(hero.hero)}</b></td>
            <td class="num">${hero.picks}</td>
            <td class="num">${hero.wins}</td>
            <td class="num"><span class="rate ${hero.winRate >= 50 ? "hi" : "lo"}">${rateText(hero.winRate)}</span></td>
            <td class="num">${hero.bans}</td>
            <td class="num">${rateText(hero.pickRate)}</td>
            <td class="num">${rateText(hero.banRate)}</td>
            <td class="num">${rateText(hero.presenceRate)}</td>
          </tr>`).join("")}</tbody>
      </table>
      <div class="hint">只统计双方各 5 个选择、10 个英雄互不重复且已填写胜负的完整对局。</div>`;
    $$("#viewHeroes th[data-sort]").forEach((cell) => {
      cell.onclick = () => {
        const key = cell.dataset.sort;
        state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : -1 };
        renderHeroes();
      };
    });
  }

  function renderTeams() {
    const rows = state.agg.teams || [];
    if (!rows.length) {
      $("#viewTeams").innerHTML = '<div class="empty">还没有队伍英雄池。对局数据上传后会自动出现，也可以使用手动录入。</div>';
      return;
    }
    $("#viewTeams").innerHTML = `
      <table>
        <thead><tr><th>队伍</th><th>胜率最高英雄 1</th><th>胜率最高英雄 2</th><th>胜率最高英雄 3</th></tr></thead>
        <tbody>${rows.map((team) => {
          const top = team.topHeroes || [];
          return `<tr>
            <td><b>${esc(team.name)}</b></td>
            <td>${esc(topHeroText(top[0]))}</td>
            <td>${esc(topHeroText(top[1]))}</td>
            <td>${esc(topHeroText(top[2]))}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
      <div class="hint">每支队伍最多显示三个英雄，按胜率优先排序；胜率相同时依次比较胜场和出场。</div>`;
  }

  function renderHeroRanking() {
    const rows = (state.agg.heroes || []).filter((hero) => hero.picks > 0);
    if (!rows.length) {
      $("#viewHeroRank").innerHTML = '<div class="empty">还没有英雄排行榜数据。</div>';
      return;
    }
    $("#viewHeroRank").innerHTML = `
      <table>
        <thead><tr><th>英雄</th><th>获胜最多队伍 1</th><th>获胜最多队伍 2</th><th>获胜最多队伍 3</th></tr></thead>
        <tbody>${rows.map((hero) => {
          const top = hero.topTeams || [];
          return `<tr>
            <td><b>${esc(hero.hero)}</b></td>
            <td>${esc(topTeamText(top[0]))}</td>
            <td>${esc(topTeamText(top[1]))}</td>
            <td>${esc(topTeamText(top[2]))}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
      <div class="hint">按使用该英雄的获胜场次排序，格式为「队伍（使用场次，胜率）」。</div>`;
  }

  function switchTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((button) => {
      const current = button.dataset.tab === tab;
      button.classList.toggle("on", current);
      button.setAttribute("aria-pressed", String(current));
    });
    $("#viewHeroes").hidden = tab !== "heroes";
    $("#viewTeams").hidden = tab !== "teams";
    $("#viewHeroRank").hidden = tab !== "heroRank";
    $("#viewManual").hidden = tab !== "manual";
    $("#viewUploaded").hidden = tab !== "uploaded";
  }

  function selectedMatch() {
    const schedule = state.schedule || {};
    return (schedule.matches || []).find((match) => match.id === state.selectedMatchId) || null;
  }

  function matchSeries(match) {
    const raw = state.raw;
    if (!raw || !match) return null;
    return (raw.series || []).find((series) =>
      series.stage === "循环赛" &&
      series.group === match.group &&
      series.round === match.round &&
      series.teams && series.teams[0] === match.left.name && series.teams[1] === match.right.name) || null;
  }

  function renderMatchOptions() {
    const select = $("#mMatch");
    if (!select) return;
    const schedule = state.schedule || { groups: [], matches: [] };
    const previous = state.selectedMatchId || select.value;
    select.innerHTML = '<option value="">请选择小组赛场次</option>';
    for (const group of schedule.groups || []) {
      const current = (schedule.matches || []).filter((match) => match.group === group.name);
      if (!current.length) continue;
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.name;
      for (const match of current) {
        const series = matchSeries(match);
        const played = series ? ` · 已录 ${series.games.length} 局` : "";
        optgroup.appendChild(new Option(match.label + played, match.id));
      }
      select.appendChild(optgroup);
    }
    if (previous && Array.from(select.options).some((option) => option.value === previous)) {
      select.value = previous;
    }
    selectMatch(select.value);
  }

  function renderManualOptions() {
    const heroes = $("#heroNamesManual");
    if (heroes) heroes.innerHTML = state.heroNames.map((name) => `<option value="${esc(name)}">`).join("");
  }

  function renderUploadedOptions() {
    const select = $("#uGame");
    if (!select) return;
    const previous = state.selectedUploadedId || select.value;
    const games = state.uploaded?.games || [];
    select.innerHTML = '<option value="">请选择已上传的对局</option>';
    games.forEach((game) => {
      const banCount = (game.bans?.left || []).length + (game.bans?.right || []).length;
      const stateText = game.countable ? (banCount ? `已填禁用 ${banCount}` : "待填禁用") : "数据不完整";
      const option = new Option(`${game.round} · ${game.leftTeam || "未识别蓝队"} vs ${game.rightTeam || "未识别红队"} · ${game.label}（${stateText}）`, game.id);
      option.disabled = !game.countable;
      select.appendChild(option);
    });
    if (previous && Array.from(select.options).some((option) => option.value === previous)) {
      select.value = previous;
    }
    selectUploadedGame(select.value);
  }

  function buildBanInputs(side) {
    const root = $(`#uBans${side}`);
    if (!root || root.children.length) return;
    for (let index = 0; index < 5; index++) {
      const input = document.createElement("input");
      input.setAttribute("list", "heroNamesManual");
      input.placeholder = `禁用 ${index + 1}（可空）`;
      root.appendChild(input);
    }
  }

  function renderLineup(selector, heroes) {
    const root = $(selector);
    if (!root) return;
    root.innerHTML = heroes.map((hero, index) =>
      `<span class="hero-chip${hero ? "" : " empty"}">${esc(hero || `英雄 ${index + 1} 未同步`)}</span>`
    ).join("");
  }

  function selectUploadedGame(id) {
    state.selectedUploadedId = id || "";
    const game = (state.uploaded?.games || []).find((item) => item.id === id) || null;
    $("#uFields").hidden = !game;
    if (!game) {
      $("#uSource").textContent = (state.uploaded?.games || []).length
        ? "请选择一局已上传的淘汰赛。"
        : "还没有已上传的对局。先在「对局数据」保存一局完整战绩。";
      return;
    }
    $("#uSource").textContent = `${state.uploaded.seriesName || "当前赛事"} · 淘汰赛 · ${game.round} · ${game.label} · 选择与胜方已自动同步`;
    $("#uTeamLeftName").textContent = game.leftTeam || "未识别蓝队";
    $("#uTeamRightName").textContent = game.rightTeam || "未识别红队";
    $("#uTeamLeftCard").textContent = game.leftTeam || "未识别蓝队";
    $("#uTeamRightCard").textContent = game.rightTeam || "未识别红队";
    renderLineup("#uLineupLeft", game.leftHeroes);
    renderLineup("#uLineupRight", game.rightHeroes);
    buildBanInputs("Left");
    buildBanInputs("Right");
    $$("#uBansLeft input").forEach((input, index) => { input.value = game.bans.left[index] || ""; });
    $$("#uBansRight input").forEach((input, index) => { input.value = game.bans.right[index] || ""; });
    $("#uSaveHint").textContent = game.winner === "left"
      ? `${game.leftTeam} 本局获胜；双方各最多 5 个禁用，可空。`
      : `${game.rightTeam} 本局获胜；双方各最多 5 个禁用，可空。`;
  }

  function collectUploadedBans(side) {
    return $$(`#uBans${side} input`).map((input) => input.value.trim()).filter(Boolean);
  }

  async function saveUploadedBans() {
    if (state.busy) return;
    const game = (state.uploaded?.games || []).find((item) => item.id === state.selectedUploadedId);
    if (!game) return alert("请先选择一局已上传的淘汰赛");
    state.busy = true;
    $("#uSave").disabled = true;
    try {
      await getJSON("/api/hero-stats/bans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: game.seriesId,
          gameId: game.gameId,
          left: collectUploadedBans("Left"),
          right: collectUploadedBans("Right"),
        }),
      });
      await loadAll(true);
      alert("禁用已保存，英雄榜已同步更新。");
    } catch (error) {
      alert("保存禁用失败：" + error.message);
    } finally {
      state.busy = false;
      $("#uSave").disabled = false;
    }
  }

  function selectMatch(id) {
    state.selectedMatchId = id || "";
    const match = selectedMatch();
    $("#mMatchEmpty").hidden = !!match;
    $("#mManualFields").hidden = !match;
    if (!match) return;
    $("#mTeamLeftName").textContent = teamText(match.left);
    $("#mTeamRightName").textContent = teamText(match.right);
    $("#mTeamLeftNameCard").textContent = teamText(match.left);
    $("#mTeamRightNameCard").textContent = teamText(match.right);
    $("#mMatchInfo").textContent = `${match.group} · ${match.round}`;
  }

  async function loadLibrary() {
    const library = await getJSON("/api/store/library");
    const series = (library.series || []).find((item) => item.id === library.currentId) || (library.series || [])[0];
    if (!series) {
      state.libraryTeams = [];
      state.schedule = { groups: [], matches: [] };
      renderMatchOptions();
      return;
    }
    state.libraryTeams = [];
    state.schedule = await getJSON("/api/hero-stats/schedule?seriesId=" + encodeURIComponent(series.id));
    renderMatchOptions();
  }

  async function loadHeroCatalog() {
    try {
      const data = await getJSON("/api/heroes");
      state.heroNames = Object.keys(data.heroes || {}).sort((a, b) => a.localeCompare(b, "zh-CN"));
    } catch {
      state.heroNames = Object.keys(state.raw && state.raw.clusters || {})
        .map((hash) => state.raw.clusters[hash] && state.raw.clusters[hash].hero)
        .filter(Boolean);
    }
    renderManualOptions();
  }

  function renderManual() {
    const build = (side) => {
      const bans = $(`#mBans${side}`);
      const picks = $(`#mPicks${side}`);
      if (!bans || !picks || bans.children.length) return;
      for (let index = 0; index < 5; index++) {
        const ban = document.createElement("div");
        ban.className = "manual-ban";
        ban.innerHTML = `<input list="heroNamesManual" placeholder="空 ban ${index + 1}（可不填）">`;
        bans.appendChild(ban);
        const pick = document.createElement("div");
        pick.className = "manual-pick";
        pick.innerHTML = `<input class="phero" list="heroNamesManual" placeholder="选择英雄 ${index + 1}">`;
        picks.appendChild(pick);
      }
    };
    build("Left");
    build("Right");
    renderManualOptions();
  }

  function collectSide(side) {
    const bans = $$(`#mBans${side} input`).map((input) => input.value.trim()).filter(Boolean);
    const picks = $$(`#mPicks${side} .phero`).map((input) => input.value.trim());
    return { bans, picks };
  }

  async function saveManual() {
    if (state.busy) return;
    const match = selectedMatch();
    if (!match) return alert("请先选择一场小组赛");
    const left = collectSide("Left");
    const right = collectSide("Right");
    if (left.picks.some((hero) => !hero) || right.picks.some((hero) => !hero)) {
      return alert("双方各 5 个选择英雄都要填");
    }
    state.busy = true;
    try {
      const out = await getJSON("/api/hero-stats/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          stage: "循环赛",
          group: match.group,
          round: match.round,
          gameNo: Number($("#mGameNo").value) || 1,
          teamLeft: match.left.name,
          teamRight: match.right.name,
          winner: $("#mWinner").value,
          left,
          right,
        }),
      });
      alert(`已保存：${match.label} · 第${out.gameNo}局${out.replaced ? "（覆盖已有同局）" : ""}`);
      $("#mGameNo").value = Math.min(7, (Number($("#mGameNo").value) || 1) + 1);
      $$("#mBansLeft input,#mBansRight input,#mPicksLeft .phero,#mPicksRight .phero").forEach((input) => { input.value = ""; });
      if (Array.from($("#fStage").options).some((option) => option.value === "循环赛")) {
        $("#fStage").value = "循环赛";
      }
      await loadAll(true);
    } catch (error) {
      alert("保存失败：" + error.message);
    } finally {
      state.busy = false;
    }
  }

  async function clearManual() {
    const answer = prompt("这会清空手动录入和全部手填禁用；对局数据上传的选择与胜负不会被删除。\n确认请输入「清除」：");
    if (answer !== "清除") return;
    try {
      await getJSON("/api/hero-stats/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "清除" }),
      });
      await loadAll(false);
      alert("已清空手动录入和手填禁用。");
    } catch (error) {
      alert("清空失败：" + error.message);
    }
  }

  function exportCsv() {
    location.href = "/api/hero-stats/export.csv?" + qs();
  }

  function exportPng() {
    const agg = state.agg;
    const rows = (agg && agg.heroes ? agg.heroes : []).slice(0, 15);
    if (!rows.length) return alert("还没有英雄数据");
    const width = 1600;
    const height = 900;
    const pad = 54;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1222"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.font = "700 44px Microsoft YaHei, sans-serif";
    ctx.fillText("英雄胜率 · " + (agg.event || ""), pad, 78);
    ctx.fillStyle = "#8fa6d8"; ctx.font = "20px Microsoft YaHei, sans-serif";
    ctx.fillText(`${agg.stage === "all" ? "全部阶段" : agg.stage} · 有效局 ${agg.summary.games} · 出场 ${agg.summary.picks}`, pad, 116);
    const top = 170;
    const rowHeight = Math.min(44, (height - top - 50) / rows.length);
    const max = Math.max(1, ...rows.map((row) => row.picks));
    rows.forEach((row, index) => {
      const y = top + index * rowHeight;
      ctx.fillStyle = index % 2 ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.05)";
      ctx.fillRect(pad, y, width - pad * 2, rowHeight - 6);
      ctx.fillStyle = "#fff"; ctx.font = "600 19px Microsoft YaHei, sans-serif";
      ctx.fillText(`${index + 1}  ${row.hero}`, pad + 14, y + rowHeight * 0.66);
      const barX = pad + 330;
      const barWidth = width - barX - 260;
      ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(barX, y + rowHeight * 0.28, barWidth, rowHeight * 0.42);
      ctx.fillStyle = "#4f86ff"; ctx.fillRect(barX, y + rowHeight * 0.28, barWidth * (row.picks / max), rowHeight * 0.42);
      ctx.fillStyle = "#cfe0ff"; ctx.font = "600 18px Consolas, monospace";
      ctx.fillText(`${row.picks} 场`, barX + barWidth + 16, y + rowHeight * 0.64);
      ctx.fillStyle = row.winRate >= 50 ? "#54e0a3" : "#ff7b8a";
      ctx.fillText(rateText(row.winRate), barX + barWidth + 100, y + rowHeight * 0.64);
    });
    ctx.fillStyle = "#6f86b8"; ctx.font = "15px Microsoft YaHei, sans-serif";
    ctx.fillText("手动录入数据 · 只统计完整对局", pad, height - 22);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "hero-winrate.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  function bind() {
    renderManual();
    $("#mSave").onclick = saveManual;
    $("#mClear").onclick = clearManual;
    $("#mMatch").onchange = (event) => selectMatch(event.target.value);
    $("#uGame").onchange = (event) => selectUploadedGame(event.target.value);
    $("#uSave").onclick = saveUploadedBans;
    $("#uRefresh").onclick = async () => {
      await loadLibrary();
      await loadAll(true);
    };
    $$(".tab").forEach((button) => { button.onclick = () => switchTab(button.dataset.tab); });
    $("#fStage").onchange = () => loadAll(false);
    $("#fGroup").onchange = () => loadAll(true);
    $("#fTeam").onchange = () => loadAll(true);
    $("#fMin").onchange = () => loadAll(true);
    $("#btnRefresh").onclick = async () => {
      await loadLibrary();
      await loadAll(true);
    };
    $("#btnCsv").onclick = exportCsv;
    $("#btnPng").onclick = exportPng;
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.data?.type !== "pkc:refresh-hero-stats") return;
      loadLibrary().then(() => loadAll(true)).catch(() => {});
    });
  }

  async function init() {
    bind();
    await loadHeroCatalog();
    await loadLibrary();
    await loadAll(false);
  }

  init().catch((error) => {
    $(".wrap").insertAdjacentHTML("afterbegin", `<div class="panel" role="alert" style="padding:14px;color:#b52b3a">加载失败：${esc(error.message)}</div>`);
  });
})();
