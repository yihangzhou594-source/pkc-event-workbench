/* ============================================================
   PKC · 04 · 英雄图库 / 粘贴解析
   英雄素材网格与候选图、文本粘贴解析。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
/* ============================================================
   九、英雄图库界面
   ============================================================ */
function isHeroName(s){
  const k = heroKey(s);
  if (!k || !HEROES) return false;
  return !!HEROES.heroes[k] || !!ISSUE_FIX[k];
}
function renderHeroGrid(){
  const grid = $("#heroGrid"), note = $("#heroNotice");
  if (!HEROES){
    note.innerHTML = '<div class="notice warn">当前是「直接打开网页」模式，读不到英雄素材目录。<b>&nbsp;请双击 启动.bat 打开</b>，即可自动扫描英雄图、支持截图识别与系列赛保存。</div>';
    grid.innerHTML = "";
    $("#heroStat").textContent = "";
    return;
  }
  note.innerHTML = HEROES.issues && HEROES.issues.length
    ? '<div class="notice warn">发现 '+HEROES.issues.length+' 个文件名疑似有误：'
      + HEROES.issues.map(it => '<b>'+esc(it.hero)+'</b>' + (it.suggest ? '（疑似 '+esc(it.suggest)+'）' : '')).join("、")
      + '。已自动按纠正后的名字匹配，如需彻底修正请改名源文件。</div>'
    : '<div class="notice ok">英雄素材扫描正常，共 '+Object.keys(HEROES.heroes).length+' 个英雄。</div>';

  const q = $("#heroSearch").value.trim().toLowerCase();
  const f = $("#heroFilter").value;
  let names = Object.keys(HEROES.heroes).sort((a,b) => a.localeCompare(b,"zh"));
  if (f === "multi") names = names.filter(n => HEROES.heroes[n].length > 1);
  if (f === "used"){
    const used = new Set();
    S.series.games.forEach(g => g.rows.forEach(r => [r.our.hero, r.opp.hero].forEach(h => { if (!isBlank(h)) used.add(heroKey(h)); })));
    names = names.filter(n => used.has(n));
  }
  if (q) names = names.filter(n => n.toLowerCase().includes(q));
  const total = names.length;
  names = names.slice(0, 160);
  $("#heroStat").textContent = total + " 个英雄 · 素材文件 " + HEROES.total + " 个";

  grid.innerHTML = "";
  if (!names.length) grid.innerHTML = '<div class="hint">没有匹配的英雄。</div>';
  names.forEach(n => {
    const cands = HEROES.heroes[n];
    const rec = heroPickRec(n);
    const el = document.createElement("div");
    el.className = "hc" + (cands.length > 1 ? " multi" : "");
    el.dataset.hero = n;
    const url = recURL(rec);
    el.innerHTML = (url ? '<img src="'+url+'" loading="lazy" alt="">' : '<div style="height:80px"></div>')
      + '<div class="t"><b>'+esc(n)+'</b>'
      + (cands.length>1 ? ' <span style="color:var(--warn)">×'+cands.length+'</span>' : '')
      + (rec && rec.alpha === false ? '<span class="hc-flag" title="原图没有透明通道，出图时会自动抠掉纯色背景">去底</span>' : '')
      + '</div>';
    if (url) applyLiftEl(el.querySelector("img"));
    el.onclick = () => showCands(n, el);
    grid.appendChild(el);
  });
}
function showCands(hero, el){
  const box = $("#heroCands");
  const cands = heroCandidates(hero);
  if (!cands.length){ box.style.display = "none"; return; }
  const cur = heroPickRec(hero);
  box.style.display = "flex";
  box.innerHTML = '<div style="width:100%;font-size:12.5px;color:var(--muted);margin-bottom:2px">'
    + '<b style="color:var(--text)">'+esc(hero)+'</b> 有 '+cands.length+' 张候选，点选一张作为默认：'
    + (cands.length>1 ? '（黄标为多候选英雄，选完自动记住）' : '') + '</div>';
  cands.forEach(c => {
    const d = document.createElement("div");
    d.className = "cand" + (cur && cur.rel === c.rel ? " on" : "");
    const url = recURL(c);
    d.innerHTML = (url ? '<img src="'+url+'" loading="lazy" alt="">' : '<div style="height:76px"></div>')
      + '<div class="t">'+esc(c.rel)+(c.alpha?"":"<br>⚠无透明")+'</div>';
    if (url) applyLiftEl(d.querySelector("img"));
    d.onclick = () => {
      DB.heroPick[heroKey(hero)] = c.rel;
      IMG.length = 0;
      scheduleSave();
      showCands(hero, el); renderHeroGrid(); rebuildTablesSoon();
      toast("已选定：" + hero + " → " + c.rel);
    };
    box.appendChild(d);
  });
}
function focusHero(name){
  switchTab("hero");
  $("#heroSearch").value = name;
  $("#heroFilter").value = "all";
  renderHeroGrid();
  const el = $$(".hc").find(x => x.dataset.hero === heroKey(name));
  if (el){ el.scrollIntoView({ block:"center", behavior:"smooth" }); showCands(heroKey(name), el); }
}
function rebuildTablesSoon(){ clearTimeout(rebuildTablesSoon._t); rebuildTablesSoon._t = setTimeout(renderTables, 60); }

/* ============================================================
   十、粘贴 / 解析
   ============================================================ */
/** 人名归一化：去掉空格、零宽字符、大小写差异（名单里常带 ㅤ/​⁠ 这种看不见的字符） */
const normPlayerName = s => String(s == null ? "" : s)
  .replace(/[\s\u3000\u200b-\u200f\u2060\ufeff\u00a0]/g, "")
  .toLowerCase();
/** 识别出来的选手名 → 队伍名单：
 *  ① 对得上就把名字统一成名单里的写法（下拉框会直接选中它，不再显示「不在名单」）
 *  ② 顺手把这个选手在名单里的分路填到「位置」列（位置不限制，随时可以手动改） */
function autoMatchPlayers(side){
  const team = side === "opp" ? S.opp : S.our;
  const roster = ((team && team.players) || []).filter(Boolean);
  if (!roster.length) return { matched:0, laned:0 };
  const laneKey = side === "opp" ? "posOpp" : "pos";
  const index = {};
  roster.forEach((n, i) => { const k = normPlayerName(n); if (k && index[k] === undefined) index[k] = { name:n, lane: i < 5 ? POSITIONS[i] : "" }; });
  const usedLane = {};
  S.game.rows.forEach(r => { if (r[laneKey]) usedLane[r[laneKey]] = true; });
  let matched = 0, laned = 0;
  S.game.rows.forEach(r => {
    const p = r[side];
    if (!p.name) return;
    const key = normPlayerName(p.name);
    let hit = index[key];
    if (!hit && key.length >= 2){                        // 容错：OCR 多字少字时用包含匹配兜一下
      const keys = Object.keys(index).filter(k => k.length >= 2 && (k.includes(key) || key.includes(k)));
      if (keys.length === 1) hit = index[keys[0]];
    }
    if (!hit) return;
    matched++;
    if (p.name !== hit.name) p.name = hit.name;           // 统一成名单里的写法
    if (!r[laneKey] && hit.lane && !usedLane[hit.lane]){  // 名单里有分路就自动填上（可手动改）
      r[laneKey] = hit.lane; usedLane[hit.lane] = true; laned++;
    }
  });
  return { matched, laned };
}
/** 用英雄补分路：默认只填空位；force=true 时按英雄重新匹配整侧，同一位置不会重复。 */
function autoMatchHeroLanes(side, force){
  const laneKey = side === "opp" ? "posOpp" : "pos";
  const used = new Set(force ? [] : S.game.rows.map(r => r[laneKey]).filter(Boolean));
  let laned = 0, missing = 0;
  S.game.rows.forEach(r => {
    const hero = r[side] && r[side].hero;
    if (!hero || (!force && r[laneKey])) return;
    const opts = heroLaneOptions(hero);
    const lane = opts.find(x => !used.has(x));
    if (lane){
      r[laneKey] = lane;
      used.add(lane);
      laned++;
    } else {
      missing++;
    }
  });
  return { laned, missing };
}
function splitCells(line){
  let cells = line.split(/\t|,|\uFF0C|\s{2,}/).map(s => s.trim()).filter(s => s !== "");
  if (cells.length < 4) cells = line.split(/\s+/).map(s => s.trim()).filter(Boolean);
  return cells;
}
function applyPlayer(side, pos, player, seq){
  const laneKey = side === "opp" ? "posOpp" : "pos";
  let idx = pos ? S.game.rows.findIndex(r => r[laneKey] === pos) : -1;
  if (idx < 0){
    idx = S.game.rows.findIndex(r => isBlank(r[side].name) && isBlank(r[side].hero));
    if (idx < 0) idx = S.game.rows.findIndex(r => isBlank(r[side].name));
    if (idx < 0) idx = (seq||0) % POSITIONS.length;
  }
  Object.assign(S.game.rows[idx][side], player);
  if (pos) S.game.rows[idx][laneKey] = pos;      // 粘贴里带了分路就照填（不自动猜）
}
function parseLines(text){
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let count = 0, seq = 0;
  lines.forEach(line => {
    const cells = splitCells(line);
    if (cells.length < 3) return;
    if (/选手|英雄|击杀|阵营|位置|伤害占比/.test(cells.join(""))) return;
    let i = 0, side = null, pos = null;
    const s0 = cells[0].toLowerCase();
    if (SIDE_ALIAS[s0]){ side = SIDE_ALIAS[s0]; i++; }
    const p0 = (cells[i]||"").trim(), p0l = p0.toLowerCase();
    if (POS_ALIAS[p0] || POS_ALIAS[p0l]){ pos = POS_ALIAS[p0] || POS_ALIAS[p0l]; i++; }
    if (i >= cells.length) return;
    let name = cells[i], hero = "";
    if (isHeroName(name)){ hero = heroKey(name); name = ""; i++; }
    else {
      i++;
      if (cells[i] && !/^[\d.%\/]+$/.test(cells[i])){ hero = cells[i]; i++; }
    }
    const rest = [];
    for (; i<cells.length; i++){
      const m = cells[i].match(/^(\d+)\s*[\/\-]\s*(\d+)\s*[\/\-]\s*(\d+)$/);
      if (m) rest.push(m[1], m[2], m[3]); else rest.push(cells[i]);
    }
    const p = emptyP();
    p.name = name; p.hero = hero;
    /* 兼容旧模板里多出来的一列「补刀」，新模板不再要求它。 */
    if (rest.length >= 12) rest.splice(9, 1);
    for (let n=0; n<NUM_ORDER.length && n<rest.length; n++){
      const v = rest[n];
      if (v === undefined || v === "-" || v === "—" || v === "/") continue;
      p[NUM_ORDER[n]] = v;
    }
    if (!side){
      const free = POSITIONS.map((_,k) => k).find(k => isBlank(S.game.rows[k].our.name) && isBlank(S.game.rows[k].our.hero));
      side = (free === undefined) ? "opp" : "our";
    }
    applyPlayer(side, pos, p, seq++);
    count++;
  });
  return count;
}
