/* ============================================================
   PKC · 02 · 系列赛 / 对局 / 队伍 / 表格 / 标签页
   队伍库、场次与局次、五路数据表、待核对清单、标签页切换。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
/* ============================================================
   四、系列赛 / 对局 / 队伍
   ============================================================ */
function renderSeriesSelect(){
  const sel = $("#selSeries");
  sel.innerHTML = DB.series.map(s => '<option value="'+s.id+'">'+esc(s.name)+'</option>').join("");
  sel.value = S.series.id;
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ---------- 赛程场次索引 ---------- */
function bkMatchList(){
  return bkTree().list.map(m => ({ ...m, ready: !!(m.a && m.b) }));
}
function bkMatchByKey(key){
  if (!key) return null;
  return bkTree().map[key] || null;
}
function bkSelectableMatches(){
  const withGames = new Set(S.series.games.map(g => g.matchKey).filter(Boolean));
  return bkMatchList().filter(m => (m.a && m.b) || withGames.has(m.key));
}
function gamesOfMatch(key){
  return S.series.games.map((g, i) => ({ game: g, index: i }))
    .filter(x => (x.game.matchKey || "") === (key || ""));
}
function renderMatchBar(){
  const sel = $("#selMatch");
  if (!sel) return;
  const cur = S.game ? (S.game.matchKey || "") : "";
  const list = bkSelectableMatches();
  const byRound = {};
  list.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
  const loose = S.series.games.filter(g => !(g.matchKey || "")).length;
  let html = '<option value="">未关联赛程' + (loose ? '（' + loose + ' 局）' : '') + '</option>';
  BK_ORDER.forEach(rd => {
    const arr = byRound[rd];
    if (!arr || !arr.length) return;
    html += '<optgroup label="' + esc(BK_ROUNDS[rd].name) + '">';
    arr.forEach(m => {
      const n = gamesOfMatch(m.key).length;
      html += '<option value="' + m.key + '">'
        + esc(m.code + " · " + (bkTeamName(m.a) || m.aLabel) + " vs " + (bkTeamName(m.b) || m.bLabel))
        + (n ? "（已录 " + n + " 局）" : "") + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
  sel.value = cur;
  const add = $("#btnMatchData");
  if (add) add.disabled = !cur;
  const clr = $("#btnClearMatch");
  if (clr) clr.style.display = matchHasData(cur) ? "" : "none";
}
function matchTeamMismatch(key, g){
  const m = bkMatchByKey(key);
  if (!m || !g || !m.a || !m.b) return "";
  const ids = [g.ourId, g.oppId].filter(Boolean);
  if (!ids.length) return "";
  if (ids.length === 2 && ids.every(id => id === m.a || id === m.b)) return "";
  return "赛程是 " + bkTeamName(m.a) + " vs " + bkTeamName(m.b)
    + "，这局录的是 " + (bkTeamName(g.ourId) || "未选") + " vs " + (bkTeamName(g.oppId) || "未选");
}
function renderMatchWarn(){
  const el = $("#matchWarn");
  if (!el) return;
  const msg = S.game ? matchTeamMismatch(S.game.matchKey || "", S.game) : "";
  el.textContent = msg ? "⚠ " + msg + "；不会自动改任何一边。" : "";
  el.style.display = msg ? "" : "none";
}
function openMatch(key){
  const m = bkMatchByKey(key);
  if (!m) { toast("找不到这场赛程"); return null; }
  const list = gamesOfMatch(key);
  if (list.length){
    S.series.current = list[list.length - 1].index;
  } else {
    const g = newGame("第1局", key);
    if (m.a) g.ourId = m.a;
    if (m.b) g.oppId = m.b;
    S.series.games.push(g);
    S.series.current = S.series.games.length - 1;
  }
  switchTab("data");
  renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview(); renderMgInfo();
  publishContext(0);
  scheduleSave();
  return S.game;
}

function renderGameBar(){
  renderMatchBar();
  const s = S.series, bar = $("#gameBar");
  const key = S.game ? (S.game.matchKey || "") : "";
  const list = s.games.map((g, i) => ({ g, i })).filter(x => (x.g.matchKey || "") === key);
  bar.innerHTML = "";
  list.forEach(({ g, i }) => {
    const b = document.createElement("button");
    b.className = "mini" + (i===s.current ? " primary" : "");
    b.textContent = g.label;
    b.onclick = () => {
      s.current = i;
      renderGameBar(); renderGameForm(); renderTables(); renderPreview();
      renderMatchWarn(); publishContext(0);
    };
    bar.appendChild(b);
  });
  const add = document.createElement("button");
  add.className = "mini"; add.textContent = "＋ 新一局";
  add.onclick = () => {
    const prev = list.length ? list[list.length - 1].g : S.game;
    const ng = newGame("第"+(list.length+1)+"局", key);
    const swapped = !!(prev && prev.ourId && prev.oppId);
    if (swapped){
      ng.ourId = prev.oppId;
      ng.oppId = prev.ourId;
    } else if (prev){
      ng.ourId = prev.ourId || "";
      ng.oppId = prev.oppId || "";
    }
    if (!ng.ourId || !ng.oppId){
      const m = key ? bkMatchByKey(key) : null;
      if (m){ ng.ourId = m.b || ng.ourId; ng.oppId = m.a || ng.oppId; }
    }
    s.games.push(ng);
    s.current = s.games.length-1;
    renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview();
    publishContext(0); scheduleSave();
    toast(swapped ? ("已新建「" + ng.label + "」，红蓝方已互换") : ("已新建「" + ng.label + "」"));
  };
  bar.appendChild(add);
  if (list.length > 1){
    const del = document.createElement("button");
    del.className = "mini"; del.textContent = "删除本局";
    del.onclick = () => {
      if (!confirm("删除「"+S.game.label+"」？")) return;
      s.games.splice(s.current,1);
      s.current = clamp(s.current,0,s.games.length-1);
      renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview();
      publishContext(0); scheduleSave();
    };
    bar.appendChild(del);
  }
  const m = S.game.matchKey ? bkMatchByKey(S.game.matchKey) : null;
  $("#gameHint").textContent = s.games.length + " 局已录入 · "
    + (m ? m.code + " · " : "") + "本场 " + list.length + " 局 · 当前 " + S.game.label;
  renderMatchWarn();
}

/** 队伍下拉：唯一来源是队伍库，① 不再隐式建队或改名。 */
function matchTeamIds(){
  const key = S.game ? (S.game.matchKey || "") : "";
  if (!key) return null;
  const m = bkMatchByKey(key);
  if (!m) return null;
  const ids = [m.a, m.b].filter(Boolean);
  return ids.length ? ids : null;
}
function fillTeamSelects(){
  const allowed = matchTeamIds();
  const opts = '<option value="">— 未选择 —</option>' + S.series.teams
    .filter(t => t.name && (!allowed || allowed.includes(t.id)))
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh"))
    .map(t => '<option value="' + esc(t.id) + '">' + esc(t.name)
      + (t.eliminated ? "（停用）" : "") + '</option>')
    .join("");
  const g = S.game;
  [["our", "#inOurTeam"], ["opp", "#inOppTeam"]].forEach(([side, sel]) => {
    const old = $(sel);
    if (!old) return;
    const fresh = document.createElement("select");
    fresh.id = old.id;
    fresh.className = old.className;
    fresh.innerHTML = opts;
    fresh.value = (side === "opp" ? (g && g.oppId) : (g && g.ourId)) || "";
    fresh.onchange = () => applySideTeam(side, fresh.value);
    old.replaceWith(fresh);
  });
}
const normName = x => String(x||"").replace(/[\s　]+/g,"").trim();
const sameName = (a,b) => normName(a).toLowerCase() === normName(b).toLowerCase();
/** 按队名找队伍：完全同名（忽略大小写和空格）才算同一支 */
function findTeamByName(name){
  const n = normName(name);
  if (!n) return null;
  const teams = S.series.teams.filter(t => t.name);
  return teams.find(t => sameName(t.name, n)) || null;
}
function applySideTeam(side, id){
  const g = S.game;
  if (side === "opp") g.oppId = id; else g.ourId = id;
  autoMatchPlayers(side);                 // 换了队伍就按新队伍的名单再对一次名字/分路（已填的位置不动）
  fillTeamSelects(); renderTables(); renderPreview(); renderMgInfo(); renderMatchWarn();
  publishContext(0); scheduleSave();
}
function renderGameForm(){
  const g = S.game;
  fillTeamSelects();
  $("#inOurTeam").value = g.ourId || "";
  $("#inOppTeam").value = g.oppId || "";
  $("#inOurScore").value = g.ourScore;
  $("#inOppScore").value = g.oppScore;
  $("#selResult").value = g.result;
  $("#inDate").value = g.date;
  $("#inDur").value = g.duration || "";
  $("#inDmgBlue").value = g.dmgBlue || "";
  $("#inDmgRed").value = g.dmgRed || "";
  syncTeamDmgPH(g);
  renderMatchWarn();
  bindFieldLabels();
}

function teamGroupOf(id){
  if (!id) return "";
  const b = B();
  for (const g of BK_G) {
    if ((b.groups[g] || []).includes(id)) return g;
  }
  return "";
}
function syncTeamGroups(){
  const b = B();
  const map = {};
  BK_G.forEach(g => (b.groups[g] || []).forEach(id => { if (id) map[id] = g; }));
  S.series.teams.forEach(t => { if (map[t.id]) t.group = map[t.id]; });
}
function bkTeamStatus(id){
  if (!id) return { state: "idle", wins: 0, losses: 0, label: "" };
  const T = bkTree();
  const reset = B().win["GF"] === "b";        // 败者组冠军先赢一场 → 还有 GF2
  let wins = 0, losses = 0, decided = false;
  T.list.forEach(m => {
    if (!m.a || !m.b) return;
    const w = B().win[m.key];
    if (w !== "a" && w !== "b") return;
    const winner = w === "a" ? m.a : m.b;
    const loser = w === "a" ? m.b : m.a;
    if (winner === id) wins += 1;
    if (loser === id) {
      losses += 1;
      const finalLoss = m.round === "r16" || m.round === "lbf" || m.round === "gf2"
        || (m.round === "gf" && !reset);
      if (finalLoss) decided = true;
    }
  });
  if (decided || losses >= 2) return { state: "out", wins, losses, label: "已淘汰" };
  if (losses === 1) {
    const inFinal = T.list.some(m => (m.key === "GF" || m.key === "GF2")
      && (m.a === id || m.b === id) && B().win[m.key]);
    return { state: "lower", wins, losses, label: inFinal ? "总决赛" : "败者组" };
  }
  if (wins > 0) return { state: "alive", wins, losses, label: "晋级中" };
  return { state: "idle", wins, losses, label: "" };
}
function bkTeamMatchKey(id){
  const T = bkTree();
  const mine = T.list.filter(m => m.a === id || m.b === id);
  const next = mine.find(m => B().win[m.key] !== "a" && B().win[m.key] !== "b");
  return ((next || mine[mine.length - 1]) || {}).key || "";
}

function renderTeamGrid(){
  const grid = $("#teamGrid");
  const q = $("#teamSearch").value.trim().toLowerCase();
  const f = $("#teamFilter").value;
  let list = S.series.teams;
  const activeOf = t => !t.eliminated && bkTeamStatus(t.id).state !== "out";
  if (f === "alive") list = list.filter(activeOf);
  if (f === "out")   list = list.filter(t => bkTeamStatus(t.id).state === "out");
  if (q) list = list.filter(t => (t.name||"").toLowerCase().includes(q) || (t.group||"").toLowerCase().includes(q));
  grid.innerHTML = "";
  if (!S.series.teams.length){
    grid.innerHTML = '<div class="hint">还没有队伍，点「添加队伍」或「批量粘贴名单」。</div>';
  }
  list.forEach(t => {
    const el = document.createElement("div");
    const group = teamGroupOf(t.id) || t.group || "";
    const status = bkTeamStatus(t.id);
    el.className = "team" + ((t.eliminated || status.state === "out") ? " out" : "");
    const allP = (t.players||[]);
    const rosterN = allP.slice(0,5).filter(Boolean).length;
    const subN = allP.slice(5).filter(Boolean).length;
    el.innerHTML =
      '<i class="dot" style="background:'+t.color+'"></i>' +
      '<div style="min-width:0"><div class="nm">'+esc(t.name||"(未命名)")+'</div>' +
      '<div class="sm">选手 '+rosterN+'/5'+(subN?' · 替补 '+subN:"")
      + (group ? ' · '+esc(group)+(/组$/.test(group) ? "" : " 组") : "")
      + (status.label ? ' · <span class="tag '+(status.state==="out"?"out":"in")+'">'+esc(status.label)+'</span>' : "")
      + (t.eliminated?' <span class="tag out">已停用</span>':"")+'</div></div>' +
      '<div class="ops"></div>';
    const ops = el.querySelector(".ops");
    const mk = (txt, cls, fn) => { const b = document.createElement("button"); b.className="mini "+cls; b.textContent=txt; b.onclick=fn; ops.appendChild(b); };
    mk("选手名单","",(e)=>{ e.stopPropagation(); editRoster(t); });
    mk(t.eliminated?"启用":"停用","",(e)=>{ e.stopPropagation(); t.eliminated=!t.eliminated; renderTeamGrid(); renderGameForm(); bkOnTeamsChanged(); scheduleSave(); });
    mk("赛程","",(e)=>{
      e.stopPropagation();
      switchTab("bracket");
      const key = bkTeamMatchKey(t.id);
      requestAnimationFrame(() => {
        const hit = key ? document.querySelector('.bk-m [data-k="' + key + '"]') : null;
        const row = hit && hit.closest(".bk-m");
        if (!row) return;
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("bk-flash");
        setTimeout(() => row.classList.remove("bk-flash"), 2200);
      });
    });
    mk("编辑","",(e)=>{ e.stopPropagation(); editTeam(t); });
    mk("删","",(e)=>{ e.stopPropagation();
      if(!confirm("删除队伍「"+t.name+"」？")) return;
      S.series.teams = S.series.teams.filter(x => x.id !== t.id);
      S.series.games.forEach(g => { if(g.ourId===t.id) g.ourId=""; if(g.oppId===t.id) g.oppId=""; });
      renderTeamGrid(); renderGameForm(); renderPreview(); bkOnTeamsChanged(); scheduleSave();
    });
    grid.appendChild(el);
  });
  const total = S.series.teams.length;
  const out = S.series.teams.filter(t => bkTeamStatus(t.id).state === "out").length;
  const stopped = S.series.teams.filter(t => t.eliminated).length;
  $("#teamStat").textContent = total + " 支队伍 · 已淘汰 " + out
    + (stopped ? " · 停用 " + stopped : "");
}

function editTeam(t){
  const name = prompt("队名", t.name); if (name === null) return;
  const color = prompt("主色（如 #e8b100）", t.color); if (color === null) return;
  t.name = name.trim(); t.color = /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : t.color;
  renderTeamGrid(); renderGameForm(); renderPreview(); bkOnTeamsChanged(); scheduleSave();
}
/** 队伍选手名单：前 5 行按 上单/打野/中路/发育路/游走，第 6 行起是替补 */
function editRoster(t){
  const all = (t.players || []);
  const cur = POSITIONS.map((p,i) => p + " " + (all[i] || "")).join("\n")
    + all.slice(5).map((n,i) => "\n替补" + (i+1) + " " + n).join("");
  const v = prompt("每行一名选手：前 5 行按 上单 / 打野 / 中路 / 发育路 / 游走 顺序，第 6 行起是替补（可留空）。可整段粘贴：", cur);
  if (v === null) return;
  const arr = ["","","","",""], subs = [];
  let slot = 0;
  v.split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(ln => {
    const m = ln.match(/^(上单|打野|中路|发育路|游走)\s*[:：]?\s*(.*)$/);
    if (m){ const k = POSITIONS.indexOf(m[1]); if (k >= 0){ arr[k] = m[2].trim(); return; } }
    const s = ln.match(/^替补\s*\d*\s*[:：]?\s*(.*)$/);
    if (s){ if (s[1].trim()) subs.push(s[1].trim()); return; }
    if (slot < 5){ arr[slot++] = ln; return; }
    subs.push(ln);
  });
  t.players = arr.concat(subs.slice(0, ROSTER_MAX - 5));
  renderTeamGrid(); renderTables(); scheduleSave();
  toast("已保存 " + (t.name||"队伍") + " 的选手名单" + (subs.length ? "（含 " + Math.min(subs.length, ROSTER_MAX-5) + " 名替补）" : ""));
}
function addTeam(){
  const t = normTeam({ name:"新队伍", color:PALETTE[S.series.teams.length % PALETTE.length] });
  S.series.teams.push(t);
  renderTeamGrid(); renderGameForm(); scheduleSave();
  editTeam(t);
}
function bulkTeams(){
  const lines = $("#bulkBox").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let n = 0;
  lines.forEach(l => {
    const parts = l.split(/[,，\t]/).map(s => s.trim()).filter(s => s !== "");
    if (!parts.length) return;
    const colorArg = parts.slice(1).find(x => /^#[0-9a-f]{6}$/i.test(x));
    S.series.teams.push(normTeam({
      name: parts[0],
      color: colorArg || PALETTE[S.series.teams.length % PALETTE.length]
    }));
    n++;
  });
  $("#bulkBox").value = ""; $("#teamBulk").style.display = "none";
  renderTeamGrid(); renderGameForm(); renderTables(); bkOnTeamsChanged(); scheduleSave();
  toast("已导入 " + n + " 支队伍");
}

/* ============================================================
   四·B、导入名单（Excel / CSV / 直接粘贴）
   ------------------------------------------------------------
   认「PKC 2026 秋季赛全体参赛成员名单」这种表：一行一名选手，
   含 队伍名称 / 队内身份 / 游戏 ID / 主分路（列顺序不限，多余列忽略）。
   .xlsx 用浏览器自带的解压能力直接读，不联网、不装库。
   ============================================================ */
const IMP = { teams:null, src:"" };
const IMP_HEAD = {
  team:   ["队伍名称","队伍","战队","队名","teamname","team"],
  player: ["游戏id","选手名","选手","昵称","名字","姓名","玩家","id"],
  lane:   ["主分路","分路","位置","擅长位置","常用位置"],
  lane2:  ["备选分路","副分路","备用分路","次选位置"],
  role:   ["队内身份","身份","职务"],
  group:  ["小组","组别","分组"],
  seed:   ["组内种子","队伍种子","种子"]
};
const impNorm = s => String(s == null ? "" : s).replace(/[\s\u3000]+/g,"").toLowerCase();
const impKey  = s => String(s == null ? "" : s).replace(/[\s\u3000]+/g,"").toLowerCase();
const impCell = (row, i) => (i === undefined || i < 0 || !row) ? "" : String(row[i] == null ? "" : row[i]).trim();
/** 表头 → 列号：先整格精确匹配，再退回包含匹配，列顺序随便换都能认 */
function impHeaderMap(cells){
  const vals = (cells || []).map(impNorm), map = {};
  const put = (key, ci) => { if (map[key] === undefined) map[key] = ci; };
  Object.keys(IMP_HEAD).forEach(key => {
    for (let i = 0; i < vals.length; i++)
      if (vals[i] && IMP_HEAD[key].some(h => vals[i] === h)) { put(key, i); break; }
  });
  Object.keys(IMP_HEAD).forEach(key => {
    if (map[key] !== undefined) return;
    for (let i = 0; i < vals.length; i++)
      if (vals[i] && IMP_HEAD[key].some(h => vals[i].includes(h))) { put(key, i); break; }
  });
  return map;
}
/** 一行文字 → 单元格（tab / 逗号 / 分号，支持 Excel 的引号转义） */
function impSplitLine(line, delim){
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i];
    if (q){
      if (ch === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function impTextToRows(text){
  const t = String(text || "").replace(/\r\n?/g, "\n");
  const lines = t.split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return [];
  const nTab = (t.match(/\t/g) || []).length, nComma = (t.match(/[,，]/g) || []).length;
  const delim = (nTab >= nComma) ? "\t" : (t.includes("，") && !t.includes(",") ? "，" : ",");
  return lines.map(l => impSplitLine(l, delim));
}
/* ---------- 浏览器里直接读 .xlsx（zip + inflate + xml） ---------- */
function impZipEntries(u8){
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i >= u8.length - 66000; i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error("这个文件不是 .xlsx（没找到 zip 结构），试试另存为 xlsx 或直接复制粘贴");
  const n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const out = {}; let p = cdOff;
  for (let i = 0; i < n; i++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder("utf-8").decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    out[name] = { method, data:u8.subarray(start, start + csize) };
    p += 46 + nlen + elen + clen;
  }
  return out;
}
async function impEntryText(entry){
  let bytes = entry.data;
  if (entry.method === 8){
    if (typeof DecompressionStream === "undefined")
      throw new Error("当前浏览器不能直接解压 xlsx，请改在 Excel 里复制整块名单，粘到下面的输入框");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (entry.method !== 0){
    throw new Error("xlsx 用了不支持的压缩方式（" + entry.method + "）");
  }
  return new TextDecoder("utf-8").decode(bytes);
}
const impColIndex = ref => {
  let n = 0;
  for (const ch of String(ref || "")){ const c = ch.toUpperCase(); if (c >= "A" && c <= "Z") n = n*26 + (c.charCodeAt(0) - 64); }
  return n - 1;
};
/** 找同名标签：有的 xlsx 会写成 <x:row> 这种带前缀的，所以按「本地名」找 */
function impEls(node, name){
  const ns = node.getElementsByTagNameNS ? node.getElementsByTagNameNS("*", name) : null;
  return (ns && ns.length) ? ns : node.getElementsByTagName(name);
}
function impSheetRows(xml, shared){
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("表格内容解析失败");
  const rows = [], rowEls = impEls(doc, "row");
  for (let i = 0; i < rowEls.length; i++){
    const cells = [], cs = impEls(rowEls[i], "c");
    for (let j = 0; j < cs.length; j++){
      const c = cs[j], t = c.getAttribute("t");
      let v = "", ci = impColIndex((c.getAttribute("r") || "").replace(/[^A-Za-z]/g, ""));
      if (t === "inlineStr"){
        const ts = impEls(c, "t");
        for (let k = 0; k < ts.length; k++) v += ts[k].textContent;
      } else {
        const vs = impEls(c, "v");
        if (vs.length){
          const raw = vs[0].textContent;
          v = (t === "s") ? (shared[+raw] || "") : raw;
        }
      }
      cells[ci >= 0 ? ci : j] = v;
    }
    rows.push(cells);
  }
  return rows;
}
async function impReadXlsx(buf){
  const files = impZipEntries(new Uint8Array(buf));
  let shared = [];
  if (files["xl/sharedStrings.xml"]) shared = impSharedStrings(await impEntryText(files["xl/sharedStrings.xml"]));
  const names = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d*\.xml$/i.test(n));
  if (!names.length) throw new Error("这个 xlsx 里没找到工作表");
  let best = null;
  for (const n of names){
    const rows = impSheetRows(await impEntryText(files[n]), shared);
    if (!best || rows.length > best.length) best = rows;
  }
  return best || [];
}
function impSharedStrings(xml){
  const out = [], doc = new DOMParser().parseFromString(xml, "application/xml");
  const sis = impEls(doc, "si");
  for (let i = 0; i < sis.length; i++){
    const ts = impEls(sis[i], "t");
    let s = "";
    for (let j = 0; j < ts.length; j++) s += ts[j].textContent;
    out.push(s);
  }
  return out;
}
/* ---------- 表格 → 队伍 ---------- */
function impParseRows(rows){
  let head = -1, map = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++){
    const m = impHeaderMap(rows[i] || []);
    if (m.team !== undefined && (m.player !== undefined || m.lane !== undefined)){ head = i; map = m; break; }
  }
  if (head < 0) return { error:"没认出表头。表格里至少要有一行表头，并且带「队伍名称」和「游戏 ID」（或者是「选手」/「昵称」）这两列。" };
  const teams = [], byName = new Map();
  for (let i = head + 1; i < rows.length; i++){
    const r = rows[i] || [];
    const name = impCell(r, map.team);
    if (!name || impNorm(name) === "队伍名称") continue;
    let t = byName.get(impKey(name));
    if (!t){
      t = { name, group:impCell(r, map.group), seed:impCell(r, map.seed), members:[] };
      byName.set(impKey(name), t); teams.push(t);
    }
    const pname = impCell(r, map.player);
    if (!pname) continue;
    if (t.members.some(m => m.name === pname)) continue;      // 同一支队里重名的行只算一次
    t.members.push({ name:pname, lane:impCell(r, map.lane), lane2:impCell(r, map.lane2), role:impCell(r, map.role) });
  }
  teams.forEach(t => impAssign(t));
  return { teams, head };
}
const impLaneOf = s => {
  const k = String(s || "").replace(/[\s\u3000]+/g, "");
  if (!k) return "";
  if (POS_ALIAS[k]) return POS_ALIAS[k];
  const hit = Object.keys(POS_ALIAS).filter(a => k.includes(a)).sort((a,b) => b.length - a.length)[0];
  return hit ? POS_ALIAS[hit] : "";
};
/** 一支队的 6 个人（有的队 6 人）→ 上单/打野/中路/发育路/游走 5 个位置 */
function impAssign(t){
  const slots = ["","","","",""], rest = [];
  t.members.forEach(m => {
    m.mainLane = impLaneOf(m.lane) || impLaneOf(m.lane2);
    m.slot = -1; m.auto = false;
    if (m.mainLane){
      const i = POSITIONS.indexOf(m.mainLane);
      if (i >= 0 && !slots[i]){ slots[i] = m.name; m.slot = i; return; }
    }
    rest.push(m);
  });
  rest.forEach(m => {
    const i = slots.indexOf("");
    if (i >= 0){ slots[i] = m.name; m.slot = i; m.auto = true; m.mainLane = ""; }
  });
  t.assign = slots;
  t.extra = t.members.filter(m => m.slot < 0);
  return t;
}
/* ---------- 界面 ---------- */
function impToggle(force){
  const box = $("#teamImport"); if (!box) return;
  const on = force === undefined ? (box.style.display === "none") : !!force;
  box.style.display = on ? "block" : "none";
  if (on) box.scrollIntoView({ block:"nearest" });
}
function impSummary(){
  const teams = IMP.teams || [];
  let n = 0, willNew = 0, willUpd = 0, withExtra = 0, withAuto = 0;
  teams.forEach(t => {
    n += t.members.length;
    if (findTeamByName(t.name)) willUpd++; else willNew++;
    if (impSubsOf(t).length) withExtra++;
    if (impMoved(t).length) withAuto++;
  });
  return { teams:teams.length, players:n, willNew, willUpd, withExtra, withAuto };
}
/** 没排进 5 个位置的人（自动匹配之后多出来的）＝替补 */
const impSubsOf = t => {
  const seen = {};
  return (t.members || []).map(m => m.name).filter(nm => {
    if (!nm || seen[nm] || t.assign.indexOf(nm) >= 0) return false;
    seen[nm] = 1; return true;
  }).slice(0, ROSTER_MAX - 5);
};
/** 位置和名单里写的分路对不上的人（多半是手动挪过） */
function impMoved(t){
  const out = [];
  t.assign.forEach((nm, j) => {
    if (!nm) return;
    const m = (t.members || []).find(x => x.name === nm);
    if (!m) return;
    if (m.mainLane && m.mainLane !== POSITIONS[j]) out.push(nm + "（名单里是" + m.mainLane + "）");
    else if (!m.mainLane && m.lane) out.push(nm + "（名单里写「" + m.lane + "」）");
  });
  return out;
}
function impLaneSelect(ti, j, cur){
  const t = IMP.teams[ti], seen = {};
  const opts = ['<option value="">—</option>'].concat((t.members || []).map(m => {
    if (!m.name || seen[m.name]) return "";
    seen[m.name] = 1;
    const used = t.assign.indexOf(m.name) >= 0 && t.assign[j] !== m.name;
    return '<option value="'+esc(m.name)+'"'+(m.name === cur ? " selected" : "")+'>'
      + esc(m.name) + (used ? "（已排）" : "") + '</option>';
  })).join("");
  return '<select class="imp-lane" data-ti="'+ti+'" data-slot="'+j+'">'+opts+'</select>';
}
function impPreviewHTML(){
  const teams = IMP.teams || [];
  if (!teams.length) return "";
  const s = impSummary();
  const mode = $("#impMode") ? $("#impMode").value : "over";
  const modeTxt = mode === "skip" ? "同名队伍会跳过" : (mode === "fill" ? "同名队伍只补空缺" : "同名队伍覆盖名单");
  let html = '<div class="notice ' + (s.withExtra || s.withAuto ? "warn" : "ok") + '" style="margin-bottom:8px">'
    + '识别到 <b>' + s.teams + '</b> 支队伍 / <b>' + s.players + '</b> 名选手：'
    + '新建 <b>' + s.willNew + '</b> 支，队伍库里已有 <b>' + s.willUpd + '</b> 支（' + modeTxt + '）。'
    + (s.withExtra ? ' 其中 <b>' + s.withExtra + '</b> 支队超过 5 人，多出来的人会作为<b>替补</b>一起导入（见右边「替补」列）。' : '')
    + (s.withAuto ? ' 有 <b>' + s.withAuto + '</b> 支队的个别位置是按「全能补位」等补进去的，导入后可在队伍卡片上微调。' : '')
    + '</div>';
  html += '<div class="imp-wrap"><table class="imp-t"><thead><tr><th>队伍</th><th>小组</th>'
    + POSITIONS.map(p => '<th>' + p + '</th>').join("") + '<th>替补</th><th>提示</th></tr></thead><tbody>';
  teams.forEach((t, ti) => {
    const dup = !!findTeamByName(t.name);
    const tips = [];
    if (dup) tips.push('<span style="color:var(--primary)">库里已有</span>');
    const moved = impMoved(t);
    if (moved.length) tips.push('<span style="color:var(--muted)">' + esc(moved.join("、")) + '</span>');
    const subs = impSubsOf(t);
    html += '<tr><td class="nm">' + esc(t.name) + (t.seed ? ' <span class="hint">种子' + esc(t.seed) + '</span>' : '') + '</td>'
      + '<td>' + esc(t.group || "—") + '</td>'
      + t.assign.map((n,j) => '<td>' + impLaneSelect(ti, j, n) + '</td>').join("")
      + '<td>' + (subs.length ? esc(subs.join("、")) : '<span class="hint">—</span>') + '</td>'
      + '<td class="tip">' + (tips.join(" · ") || "—") + '</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="row" style="margin-top:10px">'
    + '<button class="primary mini" id="impApply">✓ 确认导入这 ' + s.teams + ' 支队伍</button>'
    + '<label class="sw"><input type="checkbox" id="impGroup"' + ($("#impGroup") && !$("#impGroup").checked ? "" : " checked") + '>把「小组」记到队伍上</label>'
    + '<span class="hint">导入只动队伍库，不会碰对局数据和赛程图。</span></div>';
  return html;
}
function impShow(){
  const box = $("#impPreview"); if (!box) return;
  const keep = ($(".imp-wrap") && $(".imp-wrap").scrollTop) || 0;
  box.innerHTML = IMP.teams ? impPreviewHTML() : "";
  if (keep && $(".imp-wrap")) $(".imp-wrap").scrollTop = keep;
  const btn = $("#impApply"); if (btn) btn.onclick = impApply;
  $$(".imp-lane", box).forEach(sel => {
    sel.onchange = () => {
      const t = IMP.teams[+sel.dataset.ti], j = +sel.dataset.slot, v = sel.value;
      if (!t) return;
      if (v){
        for (let k = 0; k < t.assign.length; k++) if (k !== j && t.assign[k] === v) t.assign[k] = "";   // 一个人只能在一个位置
      }
      t.assign[j] = v;
      impShow();                                   // 重画：替补列和「已排」标记跟着变
    };
  });
}
function impFail(msg){
  IMP.teams = null;
  $("#impPreview").innerHTML = '<div class="notice bad">' + esc(msg) + '</div>'
    + '<div class="hint" style="margin-top:6px">最稳的办法：在 Excel 里框选整张表（<b>连表头一起选</b>）→ Ctrl+C → 粘到上面的输入框 → 点「解析并预览」。</div>';
}
/** rows（二维数组）→ 预览 */
function impParseRowsUI(rows){
  IMP.teams = null;
  const res = impParseRows(rows);
  if (res.error) return impFail(res.error);
  if (!res.teams.length) return impFail("表里没读到队伍，检查一下有没有「队伍名称」列和内容");
  IMP.teams = res.teams;
  impShow();
  $("#impPreview").scrollIntoView({ block:"nearest" });
  toast("识别到 " + res.teams.length + " 支队伍");
}
const impParseText = text => impParseRowsUI(impTextToRows(text));
async function impParseFile(file){
  status("读取 " + file.name + "…");
  try {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "xlsx") impParseRowsUI(await impReadXlsx(await file.arrayBuffer()));
    else impParseText(await file.text());
    status("就绪");
  } catch(e){
    status("读取失败", true);
    impFail(String(e && e.message || e));
  }
}
function impApply(){
  const teams = IMP.teams; if (!teams || !teams.length) return toast("先解析名单");
  const mode = $("#impMode") ? $("#impMode").value : "over";
  const useGroup = $("#impGroup") ? $("#impGroup").checked : true;
  let created = 0, updated = 0, skipped = 0, filled = 0;
  teams.forEach(t => {
    let team = findTeamByName(t.name);
    if (team && mode === "skip"){ skipped++; return; }
    if (!team){
      team = normTeam({ name:t.name, color:PALETTE[S.series.teams.length % PALETTE.length] });
      S.series.teams.push(team);
      created++;
    } else updated++;
    if (useGroup && t.group) team.group = t.group;
    const subs = impSubsOf(t);
    if (mode === "fill"){
      t.assign.forEach((nm, i) => {
        if (nm && !String(team.players[i] || "").trim()){ team.players[i] = nm; filled++; }
      });
      subs.forEach(nm => {
        if (team.players.indexOf(nm) >= 0 || team.players.length >= ROSTER_MAX) return;
        team.players.push(nm); filled++;
      });
    } else {                                   // 覆盖：整份名单按文件里的来（5 个位置 + 替补）
      const arr = t.assign.slice(0,5);
      subs.forEach(nm => { if (nm && arr.indexOf(nm) < 0) arr.push(nm); });
      filled += arr.filter(Boolean).length;
      team.players = arr;
    }
  });
  renderTeamGrid(); renderGameForm(); bkOnTeamsChanged(); scheduleSave();
  $("#impPreview").innerHTML = '<div class="notice ok">导入完成：新建 <b>' + created + '</b> 支、更新 <b>' + updated + '</b> 支'
    + (skipped ? '、跳过 <b>' + skipped + '</b> 支' : '') + '，一共写入 ' + filled + ' 个位置。'
    + '上面对局数据里的「选手」下拉现在就有这些人了。</div>';
  toast("导入完成：" + created + " 支新建 · " + updated + " 支更新");
}

/* ============================================================
   五、对位数据表
   ============================================================ */
const COLS = [
  { k:"name", label:"选手", w:124, t:true, hint:"从该队「选手名单」里选；识别错了就选最后一项「✎ 手动输入 / 改名字…」直接改" },
  { k:"hero", label:"英雄", w:72, t:true, hero:true },
  { k:"img",  label:"图", w:34 },
  { k:"k", label:"击杀", w:44 }, { k:"d", label:"死亡", w:44 }, { k:"a", label:"助攻", w:44 },
  { k:"gold", label:"总经济", w:56 },
  { k:"gpm", label:"分均经济", w:54, auto:true, hint:"没填时用「总经济 ÷ 对局时长」自动推算" },
  { k:"dmgPct", label:"输出伤害", w:54 }, { k:"tankPct", label:"承受伤害", w:54 },
  { k:"goldShare", label:"经济占比", w:54 }, { k:"kp", label:"参团率", w:50 },
  { k:"dmgPerGold", label:"经济转伤", w:54, auto:true, hint:"= 该选手总输出 ÷ 他的总经济；没填会自动推算" },
  { k:"dmgWan", label:"总输出万", w:54, hint:"只填任意一名选手的「总输出万」，系统就会用他的「输出伤害%」反推全队总输出，再算出其他队友的总输出与经济转伤" }
];
/** 选手名下拉：只能从该队「选手名单」里选；导入进来的名单外名字也不会丢 */
const CUSTOM_NAME = "__custom__";
function makePlayerSelect(player, team, w, pos){
  const all = ((team && team.players) || []).slice(0, ROSTER_MAX);
  const roster = all.filter(Boolean);
  const cur = String(player.name || "");
  const sel = document.createElement("select");
  sel.style.width = (w-8) + "px";
  sel.style.padding = "5px 6px";
  sel.style.fontSize = "12.5px";
  sel.style.textAlign = "center";
  sel.style.borderRadius = "6px";
  sel.style.background = "var(--surface2)";
  let opts = "";
  if (!roster.length){
    opts = cur
      ? '<option value="'+esc(cur)+'" selected>'+esc(cur)+'（不在名单）</option>'
      : '<option value="" selected disabled>先在队伍库填选手名单</option>';
  } else {
    opts = '<option value="">— 选择选手 —</option>'
         + all.map((n,i) => n ? ('<option value="'+esc(n)+'"'+(n === cur ? " selected" : "")+'>'+esc(n)+(i >= 5 ? "（替补）" : "")+'</option>') : "").join("");
    if (cur && roster.indexOf(cur) < 0)
      opts += '<option value="'+esc(cur)+'" selected>'+esc(cur)+'（不在名单）</option>';
  }
  opts += '<option value="'+CUSTOM_NAME+'">✎ 手动输入 / 改名字…</option>';
  sel.innerHTML = opts;
  sel.onchange = () => {
    if (sel.value !== CUSTOM_NAME){
      player.name = sel.value;
      scheduleRenderInput(); scheduleSave();
      return;
    }
    // 纠正识别错字：直接手填名字；该位置名单还空着就顺手记进去
    const v = prompt("手动输入这名选手的名字（用于纠正识别错误）：", player.name || "");
    if (v === null){ sel.value = player.name || ""; return; }
    const name = v.trim();
    player.name = name;
    let saved = false;
    if (name && team && team.id && Array.isArray(team.players)){   // 只有队伍库里真实存在的队伍才写名单
      const i = POSITIONS.indexOf(pos);
      if (i >= 0 && !team.players[i]){ team.players[i] = name; saved = true; }
      else if (team.players.indexOf(name) < 0 && team.players.length < ROSTER_MAX){   // 位置满了就记成替补
        team.players.push(name); saved = true;
      }
    }
    renderTables(); renderTeamGrid(); scheduleRenderInput(); scheduleSave();
    if (saved) toast("已把「"+name+"」记入 "+(team.name||"该队")+" 的名单");
  };
  return sel;
}

/** 表格里「自动算出」的数值，只作灰色占位显示，不写进数据（换队伍/改时长/改任一人数据都会跟着变） */
let AUTO_FIELDS = [];
function autoPH(player, side, key){
  if (key === "gpm") return effGpm(player, S.game) || "";
  if (key === "dmgPerGold") return effPerGold(player, S.game, side) || "";
  if (key === "dmgWan") return fmtWan(effDmgWan(player, S.game, side));
  return "";
}
/** 本局信息里「蓝/红方总输出(万)」的灰字提示：没手填时显示反推出来的全队总输出 */
function syncTeamDmgPH(g){
  [["#inDmgBlue","our"],["#inDmgRed","opp"]].forEach(([sel, side]) => {
    const el = $(sel); if (!el) return;
    const t = teamTotalWan(g, side);
    el.placeholder = "选填，用来算经济转伤";
    el.title = "";
    if (isBlank(side === "opp" ? g.dmgRed : g.dmgBlue) && t.wan){
      el.placeholder = "自动推算 " + fmtWan(t.wan) + " 万";
      el.title = "按 " + t.src.name + " 的 " + fmtWan(t.src.wan) + " 万 ÷ 输出占比 " + t.src.pct + "% 反推，手填会覆盖";
    }
  });
}
/** 只刷新灰字占位（重建整张表会打断输入焦点，所以原地改） */
function refreshAutoPH(){
  AUTO_FIELDS.forEach(f => {
    if (isBlank(f.row[f.side][f.key])) f.inp.placeholder = autoPH(f.row[f.side], f.side, f.key);
  });
  syncTeamDmgPH(S.game);
}

/** 分路指定情况（蓝方、红方各自统计：还缺哪些、哪些重复了） */
function renderLaneStat(){
  const el = $("#laneStat"); if (!el) return;
  const rows = S.game.rows;
  const miss = key => POSITIONS.filter(p => !rows.some(r => r[key] === p));
  const dup  = key => POSITIONS.filter(p => rows.filter(r => r[key] === p).length > 1);
  const m1 = miss("pos"), m2 = miss("posOpp"), d1 = dup("pos"), d2 = dup("posOpp");
  const warn = [];
  if (m1.length) warn.push("蓝方缺 " + m1.join("、"));
  if (m2.length) warn.push("红方缺 " + m2.join("、"));
  if (d1.length) warn.push("蓝方重复 " + d1.join("、"));
  if (d2.length) warn.push("红方重复 " + d2.join("、"));
  el.innerHTML = "蓝方 " + (5-m1.length) + "/5 · 红方 " + (5-m2.length) + "/5 已指定"
    + (warn.length ? ' <b style="color:var(--warn)">（' + warn.join("；") + '）</b>' : "");
}

/* ---------- 本局待核对 ----------
   把最容易漏的字段和百分比异常集中成一条清单，点一下跳到对应行。 */
function sumPct(values){
  let sum = 0, n = 0;
  values.forEach(v => {
    if (isBlank(v)) return;
    const num = parseFloat(String(v).replace("%", ""));
    if (Number.isFinite(num)){ sum += num; n += 1; }
  });
  return n ? sum : null;
}
function collectIssues(){
  const out = [];
  const g = S.game;
  if (!g) return out;
  ["our", "opp"].forEach(side => {
    const label = side === "our" ? "蓝方" : "红方";
    const seen = new Map();
    g.rows.forEach((r, i) => {
      const p = r[side] || {};
      const where = label + " 第" + (i + 1) + "行";
      const missing = [];
      if (isBlank(p.name)) missing.push("选手");
      if (isBlank(p.hero)) missing.push("英雄");
      if (isBlank(p.k) && isBlank(p.d) && isBlank(p.a)) missing.push("KDA");
      if (isBlank(p.gold)) missing.push("总经济");
      if (missing.length) out.push({ text: where + " 缺 " + missing.join(" / "), side, row: i });
      if (!isBlank(p.hero)){
        const k = heroKey(p.hero);
        if (seen.has(k)) out.push({ text: where + " 英雄重复：" + p.hero, side, row: i });
        else seen.set(k, i);
      }
    });
    const dmg = sumPct(g.rows.map(r => r[side] && r[side].dmgPct));
    if (dmg !== null && Math.abs(dmg - 100) > 2) {
      out.push({ text: label + "输出占比合计 " + dmg.toFixed(1) + "%（应约 100%）", side });
    }
    const tank = sumPct(g.rows.map(r => r[side] && r[side].tankPct));
    if (tank !== null && Math.abs(tank - 100) > 2) {
      out.push({ text: label + "承伤占比合计 " + tank.toFixed(1) + "%（应约 100%）", side });
    }
  });
  if (isBlank(g.ourScore) || isBlank(g.oppScore)) out.push({ text: "本局比分没填" });
  if (isBlank(g.duration)) out.push({ text: "对局时长没填" });
  return out;
}
function renderIssues(){
  const host = $("#issueList");
  if (!host) return;
  const list = collectIssues();
  const stat = $("#issueStat");
  if (stat) stat.textContent = list.length ? list.length + " 项待核对" : "没有发现问题";
  if (!list.length){
    host.innerHTML = '<div class="notice ok">数据看起来齐了，可以出图。</div>';
    return;
  }
  host.innerHTML = list.slice(0, 24).map((x, i) =>
    '<button type="button" class="issue" data-idx="' + i + '">⚠ ' + esc(x.text) + "</button>").join("")
    + (list.length > 24 ? '<div class="hint">还有 ' + (list.length - 24) + " 项…</div>" : "");
  $$(".issue", host).forEach(b => {
    b.onclick = () => {
      const x = list[Number(b.dataset.idx)];
      if (x && x.side && Number.isInteger(x.row)){
        const tr = document.querySelector('#tables tr[data-side="' + x.side + '"][data-row="' + x.row + '"]');
        if (tr){
          tr.scrollIntoView({ behavior: "smooth", block: "center" });
          tr.classList.add("row-flash");
          setTimeout(() => tr.classList.remove("row-flash"), 1800);
        }
      } else {
        const t = $("#tables");
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  });
}

function renderTables(){
  const host = $("#tables"); host.innerHTML = "";
  AUTO_FIELDS = [];
  renderLaneStat();
  [["our","蓝方"],["opp","红方"]].forEach(([side,label]) => {
    const team = side === "our" ? S.our : S.opp;
    const box = document.createElement("div");
    box.style.marginBottom = "12px";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:8px;margin:6px 2px";
    head.innerHTML = '<i style="width:10px;height:10px;border-radius:3px;display:inline-block;background:'+team.color+'"></i>'
                   + '<b style="font-size:13px">'+label+'：'+esc(team.name||"未选择队伍")+'</b>'
                   + '<span class="hint">'+(side==="our"?"图上左侧":"图上右侧")+'</span>';
    box.appendChild(head);

    const tbl = document.createElement("table");
    tbl.className = "g";
    tbl.innerHTML = "<thead><tr><th style='text-align:left;padding-left:6px'>位置</th>"
      + COLS.map(c=>'<th style="min-width:'+c.w+'px"'+(c.hint?' title="'+esc(c.hint)+'"':"")+'>'+c.label+'</th>').join("") + "</tr></thead>";
    const tb = document.createElement("tbody");
    S.game.rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.dataset.side = side;
      tr.dataset.row = String(i);
      const td = document.createElement("td");
      td.className = "pos";
      const laneKey = side === "opp" ? "posOpp" : "pos";     // 两边分路各自独立
      const sel = document.createElement("select");
      sel.style.cssText = "padding:4px 2px;font-size:12.5px;font-weight:700;background:transparent;border-color:transparent;width:76px";
      sel.title = "手动指定这名选手的分路（两边可以不一样，出图时按分路对齐）";
      sel.innerHTML = '<option value=""'+(isBlank(row[laneKey])?" selected":"")+'>未指定</option>'
        + POSITIONS.map(p => '<option value="'+p+'"'+(p===row[laneKey]?" selected":"")+'>'+p+'</option>').join("");
      sel.onchange = () => {
        row[laneKey] = sel.value;              // 不设限制：允许同边重复、也允许留空
        renderTables(); renderPreview(); scheduleSave();
      };
      td.appendChild(sel);
      tr.appendChild(td);
      COLS.forEach(c => {
        const cell = document.createElement("td");
        if (c.t) cell.className = "t";
        if (c.k === "img"){
          const url = heroThumbURL(row[side].hero);
          const img = document.createElement("img");
          img.className = "hero-img" + (url ? "" : " none");
          img.src = url || EMPTY_PX;
          if (url) applyLiftEl(img);
          img.title = url ? "点击更换这张英雄图" : "先在「英雄」列填英雄名";
          img.onclick = () => { if (row[side].hero) { switchTab("hero"); focusHero(row[side].hero); } };
          cell.appendChild(img);
        } else if (c.k === "name"){
          cell.appendChild(makePlayerSelect(row[side], team, c.w, side === "opp" ? row.posOpp : row.pos));
        } else {
          const inp = document.createElement("input");
          inp.type = "text"; inp.value = row[side][c.k] || "";
          inp.style.minWidth = (c.w-8)+"px";
          if (c.hero) inp.setAttribute("list", "heroDL");
          if (c.auto || c.k === "dmgWan"){
            inp.placeholder = autoPH(row[side], side, c.k);
            AUTO_FIELDS.push({ inp, row, side, key:c.k });
            if (c.hint) inp.title = c.hint;
          }
          inp.oninput = () => {
            row[side][c.k] = inp.value;
            if (c.k === "hero"){
              const u = heroThumbURL(inp.value);
              const im = cell.parentNode.querySelector(".hero-img");
              if (im){ im.src = u || EMPTY_PX; im.className = "hero-img" + (u?"":" none"); }
            }
            if (c.k === "gold" && isBlank(row[side].gpm)){
              const gv = effGpm(row[side], S.game);
              if (gv) row[side].gpm = gv;
            }
            if (c.k === "dmgWan" && isBlank(row[side].dmgPerGold)){
              const v = effPerGold(row[side], S.game, side);
              if (v) row[side].dmgPerGold = v;
            }
            refreshAutoPH();          // 原地刷新「自动算出」的灰字，不打断输入焦点
            scheduleRenderInput();
            scheduleSave();
          };
          cell.appendChild(inp);
        }
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    box.appendChild(tbl);
    host.appendChild(box);
  });
  renderIssues();
}

/* ============================================================
   六、标签页
   ============================================================ */
function switchTab(name){
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
  $$(".panel").forEach(p => p.classList.toggle("on", p.id === "panel-" + name));
  const wide = name === "bracket" || name === "help";   // 赛程图 / 说明页收起右侧预览，整页给内容
  $$(".layout").forEach(l => l.classList.toggle("single", wide));
  const pv = $("#preview");
  if (pv) pv.style.display = wide ? "none" : "";
  const pvBtn = $("#btnPreviewToggle");
  if (pvBtn) pvBtn.hidden = wide;
  if (name === "teams") renderTeamGrid();
  if (name === "hero") renderHeroGrid();
  if (name === "out") renderMgInfo();
  if (name === "bracket"){ renderBracket(); renderBkPreviewArea(); publishBracketLive(null, 60); }
  /* 内嵌在外壳 iframe 里时，把当前标签回传，侧栏跟着高亮 */
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "pkc:tab", tab: name }, "*");
    }
  } catch {}
}
