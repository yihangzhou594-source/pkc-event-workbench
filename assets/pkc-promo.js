/* ============================================================
   PKC · 赛前宣传图
   参考赛事转播视觉，输出 1920×1080 PNG（16:9）。
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v);
  function setActionStatus(message, bad) {
    const el = $("#pActionStatus");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", !!bad);
  }
  const W = 1920, H = 1080;
  const LANES = ["上单", "打野", "中路", "发育路", "游走"];
  const state = { teams: [], art: null, images: {}, token: 0 };
  const canvas = $("#poster");
  const ctx = canvas.getContext("2d");

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    const t = await r.text();
    try {
      const data = JSON.parse(t);
      if (!r.ok) throw new Error(data.message || data.error || ("HTTP " + r.status));
      return data;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(t.slice(0, 200));
      throw error;
    }
  }

  function image(src) {
    if (!src) return Promise.resolve(null);
    if (state.images[src]) return Promise.resolve(state.images[src]);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { state.images[src] = im; res(im); };
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  async function loadLibrary() {
    try {
      const lib = await getJSON("/api/store/library");
      const series = (lib.series || []).find((s) => s.id === lib.currentId) || (lib.series || [])[0];
      const roster = series ? await getJSON("/api/competition/teams?seriesId=" + encodeURIComponent(series.id)) : { teams: [] };
      state.teams = (roster.teams || []).map((t) => ({
        name: String(t.name || ""),
        color: String(t.color || ""),
        availableForSelection: t.availableForSelection !== false,
        players: (t.players || []).map((p) => String(p || "")).filter(Boolean),
        playerLanes: Array.isArray(t.playerLanes) ? t.playerLanes.map((x) => String(x || "")) : [],
      })).filter((t) => t.name);
      $("#pTeamNames").innerHTML = state.teams.filter((t) => t.availableForSelection)
        .map((t) => `<option value="${esc(t.name)}">`).join("");
    } catch (error) {
      setActionStatus("队伍资料读取失败，可手动输入队名和名单；检查服务后可刷新重试。" + (error.message ? " " + error.message : ""), true);
    }
  }

  function buildRows(side) {
    const host = $(side === "Left" ? "#pPlayersLeft" : "#pPlayersRight");
    if (!host || host.children.length) return;
    host.innerHTML = LANES.map((lane, i) =>
      `<div class="player"><select class="plane" aria-label="${side === "Left" ? "左队" : "右队"}第 ${i + 1} 位选手分路">${LANES.concat(["对抗路", "补位"]).map((l) => `<option${l === lane ? " selected" : ""}>${l}</option>`).join("")}</select><input aria-label="${side === "Left" ? "左队" : "右队"}第 ${i + 1} 位选手姓名" placeholder="选手 ${i + 1}"><input class="hero-name" aria-label="代表英雄" placeholder="代表英雄（搜索或手填）"></div>`).join("");
  }

  function updateSubSummary(side) {
    const input = $(side === "Left" ? "#pSubLeft" : "#pSubRight");
    const summary = $(side === "Left" ? "#pSubLeftSummary" : "#pSubRightSummary");
    if (!input || !summary) return;
    const name = input.value.trim();
    summary.textContent = name ? "替补选手：" + name : "添加替补选手（可选）";
  }

  function fillTeam(side) {
    const input = $(side === "Left" ? "#pTeamLeft" : "#pTeamRight");
    const team = state.teams.find((t) => t.name === input.value.trim());
    if (!team || !team.availableForSelection) return;
    const last = input.dataset.lastTeam || "";
    if (last === team.name) return;
    input.dataset.lastTeam = team.name;
    $$(`#pPlayers${side} .player input:not(.hero-name)`).forEach((el, i) => { el.value = team.players[i] || ""; });
    $$(`#pPlayers${side} .plane`).forEach((el, i) => { el.value = team.playerLanes[i] || LANES[i]; });
    const subs = $(side === "Left" ? "#pSubsLeft" : "#pSubsRight");
    if (subs) subs.innerHTML = team.players.slice(5).map((n) => `<option value="${esc(n)}">`).join("");
    const subInput = $(side === "Left" ? "#pSubLeft" : "#pSubRight");
    const subLane = $(side === "Left" ? "#pSubLaneLeft" : "#pSubLaneRight");
    if (subInput) subInput.value = team.players[5] || "";
    if (subLane) subLane.value = team.playerLanes[5] || "";
    updateSubSummary(side);
  }

  function teamColor(name, fallback) {
    const t = state.teams.find((x) => x.name === name);
    return (t && t.color) || fallback;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ellipsis(text, maxW) {
    text = String(text || "");
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }

  function cover(img, x, y, w, h) {
    if (!img) return;
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function contain(img, x, y, w, h) {
    if (!img) return;
    const s = Math.min(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function panel(x, y, w, h, team, color, players, lanes, side, sub, subLane) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "rgba(255,250,235,.98)");
    g.addColorStop(.65, "rgba(248,237,210,.97)");
    g.addColorStop(1, "rgba(239,220,180,.96)");
    roundRect(x, y, w, h, 26);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(166,119,45,.62)"; ctx.lineWidth = 2; ctx.stroke();

    // 外侧队伍色光条
    ctx.save();
    roundRect(x, y, w, h, 26); ctx.clip();
    const lg = ctx.createLinearGradient(x, y, x, y + h);
    lg.addColorStop(0, color); lg.addColorStop(.8, "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(side === "left" ? x : x + w - 7, y, 7, h);
    ctx.restore();

    // 队徽首字
    const cx = side === "left" ? x + 78 : x + w - 78;
    ctx.beginPath(); ctx.arc(cx, y + 70, 46, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(cx - 16, y + 53, 4, cx, y + 70, 52);
    bg.addColorStop(0, "#FFE9BC"); bg.addColorStop(.6, color); bg.addColorStop(1, "#8d6a2f");
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = "rgba(255,240,205,.9)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff8e7"; ctx.font = '900 44px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((team || "?").slice(0, 1), cx, y + 72);

    ctx.textAlign = side === "left" ? "left" : "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color; ctx.font = '700 15px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText(side === "left" ? "BLUE SIDE" : "RED SIDE", side === "left" ? x + 144 : x + w - 144, y + 58);
    ctx.fillStyle = "#634525"; ctx.font = '900 34px "Microsoft YaHei", sans-serif';
    ctx.fillText(ellipsis(team, w - 205), side === "left" ? x + 144 : x + w - 144, y + 104);

    ctx.strokeStyle = "rgba(233,195,127,.20)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 28, y + 132); ctx.lineTo(x + w - 28, y + 132); ctx.stroke();

    const all = players.slice(0, 5).map((name, i) => ({ name, lane: lanes[i] || LANES[i] }));
    if (sub) all.push({ name: sub, lane: subLane || "补位" });
    all.slice(0, 6).forEach((p, i) => {
      const ry = y + 151 + i * 62;
      roundRect(x + 24, ry, w - 48, 52, 11);
      const rg = ctx.createLinearGradient(x + 24, ry, x + w - 24, ry);
      rg.addColorStop(0, "rgba(255,255,255,.82)"); rg.addColorStop(1, "rgba(215,188,135,.20)");
      ctx.fillStyle = rg; ctx.fill();
      ctx.strokeStyle = "rgba(154,112,49,.18)"; ctx.stroke();

      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const leftSide = side === "left";
      ctx.fillStyle = "#9a7443"; ctx.font = '700 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = leftSide ? "left" : "right";
      ctx.fillText(p.lane, leftSide ? x + 42 : x + w - 42, ry + 32);
      ctx.fillStyle = "#563d25"; ctx.font = '800 23px "Microsoft YaHei", sans-serif';
      ctx.fillText(ellipsis(p.name || "—", w - 190), leftSide ? x + 142 : x + w - 142, ry + 33);
    });
  }

  async function draw() {
    const token = ++state.token;
    const [bg, emblem] = await Promise.all([image("/assets/interval-bg.jpg"), image("/assets/pkc-emblem.png")]);
    if (token !== state.token) return;
    ctx.clearRect(0, 0, W, H);
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#f7eccf"); base.addColorStop(.48, "#ead8ae"); base.addColorStop(1, "#f8edcf");
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    if (bg) {
      ctx.save();
      ctx.globalAlpha = .12;
      cover(bg, 0, 0, W, H);
      ctx.restore();
    }
    const blueGlow = ctx.createRadialGradient(320, 520, 20, 320, 520, 820);
    blueGlow.addColorStop(0, "rgba(47,107,255,.08)"); blueGlow.addColorStop(1, "rgba(47,107,255,0)");
    ctx.fillStyle = blueGlow; ctx.fillRect(0, 0, W, H);
    const redGlow = ctx.createRadialGradient(1600, 520, 20, 1600, 520, 820);
    redGlow.addColorStop(0, "rgba(225,75,90,.07)"); redGlow.addColorStop(1, "rgba(225,75,90,0)");
    ctx.fillStyle = redGlow; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 570, 40, W / 2, 570, 460);
    glow.addColorStop(0, "rgba(233,195,127,.16)"); glow.addColorStop(1, "rgba(233,195,127,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    // 金色菱形光纹
    ctx.save();
    ctx.translate(W / 2, 570);
    ctx.rotate(Math.PI / 4);
    [250, 350, 460].forEach((s, i) => {
      ctx.strokeStyle = `rgba(233,195,127,${.11 - i * .022})`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
    });
    ctx.restore();
    // 极细斜纹，增加质感
    ctx.save();
      ctx.strokeStyle = "rgba(116,82,39,.035)";
    ctx.lineWidth = 1;
    for (let x = -H; x < W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
    }
    ctx.restore();
    if (emblem) {
      ctx.save();
      ctx.globalAlpha = .04;
      ctx.drawImage(emblem, 650, 230, 620, 620);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = "rgba(233,195,127,.38)"; ctx.lineWidth = 2;
    [[56, 116, 56, 56, 116, 56], [W - 56, 116, W - 56, 56, W - 116, 56],
     [56, H - 72, 56, H - 32, 116, H - 32], [W - 56, H - 72, W - 56, H - 32, W - 116, H - 32]]
      .forEach(([x1, y1, x2, y2, x3, y3]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
      });
    ctx.restore();
    ctx.fillStyle = "rgba(151,105,40,.32)";
    ctx.fillRect(56, 154, W - 112, 1);
    ctx.fillRect(56, 1016, W - 112, 1);

    if (state.art) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(100, Number($("#pArtOpacity").value) || 0)) / 100;
      contain(state.art, 758, 360, 404, 350);
      ctx.restore();
    }

    const event = $("#pEvent").value.trim() || "2026PKC秋季赛";
    const stage = $("#pStage").value.trim() || "16进8";
    const date = $("#pDate").value.trim();
    const time = $("#pTime").value.trim();
    const bo = $("#pBo").value;
    const sub = $("#pSub").value.trim();
    const footer = $("#pFooter").value.trim();

    if (emblem) ctx.drawImage(emblem, 56, 48, 96, 96);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#654825"; ctx.font = '900 34px "Microsoft YaHei", sans-serif';
    ctx.fillText("薄扶林王者杯", 172, 96);
    ctx.fillStyle = "rgba(101,72,37,.62)"; ctx.font = '600 13px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText("POK FU LAM KING CUP", 174, 126);

    ctx.textAlign = "right";
    ctx.fillStyle = "#654825"; ctx.font = '800 27px "Microsoft YaHei", sans-serif';
    ctx.fillText(stage, W - 56, 96);
    ctx.fillStyle = "rgba(101,72,37,.65)"; ctx.font = '600 17px "Microsoft YaHei", sans-serif';
    ctx.fillText([date, time].filter(Boolean).join(" · "), W - 56, 124);

    ctx.textAlign = "center";
    ctx.fillStyle = "#6a4b28"; ctx.font = '900 42px "Microsoft YaHei", sans-serif';
    ctx.fillText(ellipsis(event, 1350), W / 2, 228);
    if (sub) {
      ctx.fillStyle = "rgba(101,72,37,.72)"; ctx.font = '600 19px "Microsoft YaHei", sans-serif';
      ctx.fillText(ellipsis(sub, 1200), W / 2, 263);
    }
    const line = ctx.createLinearGradient(360, 0, 1560, 0);
    line.addColorStop(0, "rgba(233,195,127,0)"); line.addColorStop(.5, "rgba(233,195,127,.9)"); line.addColorStop(1, "rgba(233,195,127,0)");
    ctx.fillStyle = line; ctx.fillRect(360, 287, 1200, 1.5);
    ctx.fillStyle = "#805d2e"; ctx.font = '900 28px "Microsoft YaHei", sans-serif'; ctx.fillText("首发名单", W / 2, 330);

    const left = $("#pTeamLeft").value.trim() || "左队";
    const right = $("#pTeamRight").value.trim() || "右队";
    const lp = $$("#pPlayersLeft .player input:not(.hero-name)").map((e) => e.value.trim());
    const rp = $$("#pPlayersRight .player input:not(.hero-name)").map((e) => e.value.trim());
    const ll = $$("#pPlayersLeft .plane").map((e) => e.value);
    const rl = $$("#pPlayersRight .plane").map((e) => e.value);
    const lsub = $("#pSubLeft").value.trim();
    const rsub = $("#pSubRight").value.trim();
    const lsubLane = $("#pSubLaneLeft").value;
    const rsubLane = $("#pSubLaneRight").value;
    panel(56, 360, 820, 520, left, teamColor(left, "#58B0FF"), lp, ll, "left", "", "");
    panel(1044, 360, 820, 520, right, teamColor(right, "#FF5668"), rp, rl, "right", "", "");

    ctx.textAlign = "center";
    ctx.fillStyle = "#E9C37F"; ctx.font = '900 72px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText("VS", W / 2, 570);
    ctx.fillStyle = "rgba(101,72,37,.76)"; ctx.font = '700 19px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText(bo, W / 2, 607);
    ctx.fillStyle = "rgba(101,72,37,.48)"; ctx.font = '600 11px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText("MATCH DAY", W / 2, 633);

    ctx.fillStyle = "rgba(101,72,37,.78)"; ctx.font = '700 20px "Microsoft YaHei", sans-serif';
    ctx.fillText(footer || "今晚开赛 · 敬请期待", W / 2, 956);
    ctx.fillStyle = "rgba(101,72,37,.46)"; ctx.font = '600 12px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText("PKC 2026 · 薄扶林王者杯", W / 2, 1000);
    $("#pMsg").textContent = `${left} vs ${right} · ${bo} · ${date} ${time}`;
  }

  function bind() {
    buildRows("Left"); buildRows("Right");
    $$("#pEvent,#pStage,#pDate,#pTime,#pBo,#pSub,#pFooter,#pTeamLeft,#pTeamRight,#pArtOpacity,#pSubLeft,#pSubRight,#pSubLaneLeft,#pSubLaneRight,#pPlayersLeft input,#pPlayersRight input,#pPlayersLeft .plane,#pPlayersRight .plane")
      .forEach((el) => el.addEventListener("input", () => { setActionStatus(""); draw(); }));
    ["Left", "Right"].forEach((side) => {
      const input = $(side === "Left" ? "#pSubLeft" : "#pSubRight");
      if (input) input.addEventListener("input", () => updateSubSummary(side));
      updateSubSummary(side);
    });
    $$("#pPlayersLeft .plane,#pPlayersRight .plane").forEach((el) => el.addEventListener("change", draw));
    $("#pSubLaneLeft").addEventListener("change", draw);
    $("#pSubLaneRight").addEventListener("change", draw);
    $("#pSubLaneLeft").setAttribute("aria-label", "左队替补主选分路");
    $("#pSubLaneRight").setAttribute("aria-label", "右队替补主选分路");
    $("#pTeamLeft").addEventListener("change", () => { fillTeam("Left"); draw(); });
    $("#pTeamRight").addEventListener("change", () => { fillTeam("Right"); draw(); });
    $$("#pPlayersLeft input,#pPlayersRight input,#pTeamLeft,#pTeamRight").forEach(el => el.addEventListener("input", drawSpotlight));
    $("#spotlightPush").onclick = async () => {
      try {
        const patch = buildSpotlightPlaylist();
        await fetch("/api/director/spotlight/playlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch }) }).then(r => { if (!r.ok) throw new Error("轮播推送失败"); });
        await fetch("/api/director/scene", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "spotlight" }) });
        await fetch("/api/director/push", { method: "POST" }); setActionStatus("宣传轮播已推送到直播端。");
        window.parent.document.querySelector('.wk-item[data-view="director"]')?.click();
      } catch (e) { setActionStatus(e.message, true); }
    };
    $("#spotlightPrev").onclick = () => postSpotlight("step", { dir: -1 });
    $("#spotlightNext").onclick = () => postSpotlight("step", { dir: 1 });
    $("#spotlightToggle").onclick = async () => { const p = await currentSpotlight(); if (!p?.running && buildSpotlightPlaylist().items.filter(x => x.blue.player && x.red.player).length < 2) return setActionStatus("自动轮播至少需要两组完整的双方选手姓名。", true); await postSpotlight("playlist", { patch: { running: !p?.running } }); };
    $("#spotlightInterval").onchange = () => postSpotlight("playlist", { patch: { intervalMs: Number($("#spotlightInterval").value) } });
    $("#spotlightExport").onclick = async () => { try { await drawSpotlight(); $("#spotlightPreview").toBlob(blob => { if (!blob) return; const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "PKC-选手宣传轮播.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); } catch (e) { setActionStatus("导出失败：" + e.message, true); } };
    $("#pArt").addEventListener("change", () => {
      const f = $("#pArt").files && $("#pArt").files[0];
      if (!f) { state.art = null; $("#pArtPreview").style.display = "none"; draw(); return; }
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          state.art = im;
          const pv = $("#pArtPreview");
          pv.src = fr.result; pv.style.display = "block";
          draw();
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    $("#btnDraw").onclick = () => {
      draw().then(() => setActionStatus("预览已更新。"))
        .catch((error) => setActionStatus("生成预览失败：" + error.message + "。修改输入后可重试。", true));
    };
    $("#btnDownload").onclick = () => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) return setActionStatus("图片导出失败，请重新生成预览后再试。", true);
          try {
            const a = document.createElement("a");
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = `赛前宣传-${$("#pTeamLeft").value || "左队"}-vs-${$("#pTeamRight").value || "右队"}.png`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            setActionStatus("PNG 已开始下载。" );
          } catch (error) {
            setActionStatus("图片下载失败：" + error.message + "。请重新生成预览后重试。", true);
          }
        }, "image/png");
      } catch (error) {
        setActionStatus("图片导出失败：" + error.message + "。请重新生成预览后重试。", true);
      }
    };
  }

  function buildSpotlightPlaylist() {
    const read = id => $$(id + " .player").map(row => ({ player: row.querySelector("input:not(.hero-name)").value.trim(), heroName: row.querySelector(".hero-name").value.trim(), heroId: null }));
    const blue = read("#pPlayersLeft"), red = read("#pPlayersRight");
    return { teams: { blue: { name: $("#pTeamLeft").value.trim() }, red: { name: $("#pTeamRight").value.trim() } }, items: LANES.map((lane, i) => ({ lane, blue: blue[i], red: red[i] })), index: 0, intervalMs: Number($("#spotlightInterval").value) || 8000, running: false };
  }
  async function currentSpotlight() { try { return (await getJSON("/api/director/state")).live?.spotlightPlaylist; } catch { return null; } }
  async function postSpotlight(action, body) { await fetch("/api/director/spotlight/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await drawSpotlight(); }
  async function drawSpotlight() { const c = $("#spotlightPreview"); if (c && window.PKCSpotlight) { const saved = await currentSpotlight(); const local = buildSpotlightPlaylist(); local.index = saved?.index || 0; await window.PKCSpotlight.draw(c, local); } }

  loadLibrary().then(async () => {
    buildRows("Left"); buildRows("Right");
    const saved = await currentSpotlight();
    if (saved) {
      $("#pTeamLeft").value = saved.teams?.blue?.name || ""; $("#pTeamRight").value = saved.teams?.red?.name || "";
      ["Left", "Right"].forEach((side, i) => $$(side === "Left" ? "#pPlayersLeft .player" : "#pPlayersRight .player").forEach((row, n) => {
        const source = saved.items?.[n]?.[i ? "red" : "blue"] || {};
        row.querySelector("input:not(.hero-name)").value = source.player || ""; row.querySelector(".hero-name").value = source.heroName || "";
      }));
      $("#spotlightInterval").value = String(saved.intervalMs || 8000);
    }
    draw(); drawSpotlight();
  });
  if (window.PKCSpotlight) window.PKCSpotlight.loadHeroCatalog().then(heroes => {
    const list = $("#heroNames"); if (list) list.innerHTML = heroes.map(h => `<option value="${esc(h.name)}">`).join("");
    $$(".hero-name").forEach(input => window.PKCSpotlight.attachHeroSearch(input, heroes));
  });
  bind();
  draw();
})();
