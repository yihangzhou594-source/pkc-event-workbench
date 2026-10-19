/* 生成器共用前端模块（原抽取脚本 tools/extract-chart-core.mjs 已停用，需 --force）。
 * 逻辑未改动，唯一差异是结尾的自动初始化加了页面守卫，
 * 使 OBS 场景页等无生成器 DOM 的页面也能安全加载本模块。
 */

"use strict";

/* ============================================================
   PKC 赛后数据图生成器 v2
   浅色主题 · 截图识别 · 英雄图自动匹配 · 系列赛队伍库 · 多局对比
   ============================================================ */

const DW = 1920, DH = 1080;
const C_BLUE = "#2b6cff", C_RED = "#e5484d";   // 蓝方 / 红方（数据图统一用这两个颜色）
const FC = '"Noto Sans SC","汉仪旗黑 80S","Microsoft YaHei",sans-serif';
const FN = '"Bahnschrift SemiBold Condensed","Bahnschrift SemiBold","Noto Sans SC","Microsoft YaHei",sans-serif';
const POSITIONS = ["上单","打野","中路","发育路","游走"];
const POS_ALIAS = {
  "上单":"上单","上":"上单","对抗路":"上单","对抗":"上单","边路":"上单",
  "打野":"打野","野":"打野",
  "中路":"中路","中":"中路","中单":"中路",
  "发育路":"发育路","射":"发育路","射手":"发育路","adc":"发育路","发育":"发育路",
  "游走":"游走","辅":"游走","辅助":"游走","游":"游走"
};
const SIDE_ALIAS = {
  "我方":"our","我们":"our","本队":"our","主":"our","home":"our","1":"our","蓝":"our","蓝色方":"our",
  "对方":"opp","敌方":"opp","对手":"opp","客":"opp","away":"opp","2":"opp","红":"opp","红色方":"opp"
};
const NUM_ORDER = ["k","d","a","gold","gpm","dmgPct","tankPct","goldShare","kp","dmgPerGold","dmgWan"];
const EMPTY_PX = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.prototype.slice.call(r.querySelectorAll(s));
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const isBlank = v => v===null || v===undefined || String(v).trim()==="";
const uid = () => Math.random().toString(36).slice(2,9);
const clone = o => JSON.parse(JSON.stringify(o));

function parseNum(v){
  if (isBlank(v)) return null;
  const m = String(v).replace(/[,，\s]/g,"").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function dispVal(v, unit){
  if (isBlank(v)) return "—";
  const s = String(v).trim();
  if (unit === "%") return s.includes("%") ? s : s + "%";
  return s;
}
function hex2rgb(h){
  h = String(h||"#888").replace("#","");
  if (h.length===3) h = h.split("").map(c=>c+c).join("");
  const n = parseInt(h,16);
  return isNaN(n) ? [136,136,136] : [(n>>16)&255,(n>>8)&255,n&255];
}
function rgba(h,a){ const c = hex2rgb(h); return "rgba("+c[0]+","+c[1]+","+c[2]+","+a+")"; }
function mixc(a,b,t){
  const A = hex2rgb(a), B = hex2rgb(b), r = A.map((v,i)=>Math.round(v+(B[i]-v)*t));
  return "#" + r.map(v=>("0"+v.toString(16)).slice(-2)).join("");
}
function rr(ctx,x,y,w,h,r){
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function setFont(ctx,size,weight,family,sp){
  ctx.font=(weight||"400")+" "+size+"px "+(family||FC);
  try{ ctx.letterSpacing=(sp===undefined?"0px":sp+"px"); }catch(e){}
}
function T(ctx,str,x,y,o){
  o=o||{};
  setFont(ctx,o.size||24,o.weight||"400",o.family,o.spacing);
  ctx.fillStyle=o.color||"#16202e";
  ctx.textAlign=o.align||"left";
  ctx.textBaseline=o.baseline||"middle";
  if(o.alpha!==undefined) ctx.globalAlpha=o.alpha;
  if(o.shadow){
    ctx.save();
    ctx.shadowColor=o.shadow; ctx.shadowBlur=o.shadowBlur||10; ctx.shadowOffsetY=o.shadowY||2;
    ctx.fillText(String(str),x,y);
    ctx.restore();
  } else {
    ctx.fillText(String(str),x,y);
  }
  if(o.alpha!==undefined) ctx.globalAlpha=1;
}
function FT(ctx,str,x,y,o){
  o=o||{}; str=String(str);
  let size=o.size||32;
  const min=size*(o.minScale||0.55), fam=o.family||FC;
  setFont(ctx,size,o.weight,fam,o.spacing);
  if(o.maxWidth){ while(size>min && ctx.measureText(str).width>o.maxWidth){ size-=1; setFont(ctx,size,o.weight,fam,o.spacing); } }
  ctx.fillStyle=o.color||"#16202e";
  ctx.textAlign=o.align||"left";
  ctx.textBaseline=o.baseline||"middle";
  ctx.fillText(str,x,y);
  return size;
}
/** 保证不溢出的文字：先缩字号，缩到下限还放不下就截断加“…”（顶栏/选手名/署名都用它，避免互相压住） */
function fitText(ctx,str,x,y,o){
  o=o||{}; str=String(str==null?"":str);
  const maxW = o.maxWidth===undefined ? Infinity : o.maxWidth;
  const fam = o.family||FC, weight = o.weight||"400", spacing = o.spacing;
  const size0 = o.size||24, minS = Math.max(9, Math.round(size0*(o.minScale||0.55)));
  let size = size0;
  setFont(ctx,size,weight,fam,spacing);
  while (size > minS && ctx.measureText(str).width > maxW){ size -= 1; setFont(ctx,size,weight,fam,spacing); }
  let out = str;
  if (maxW !== Infinity && ctx.measureText(out).width > maxW){
    let cut = out.length;
    while (cut > 1 && ctx.measureText(out.slice(0,cut)+"…").width > maxW) cut--;
    out = cut > 1 ? out.slice(0,cut)+"…" : out.slice(0,1);
  }
  ctx.fillStyle = o.color||"#16202e";
  ctx.textAlign = o.align||"left";
  ctx.textBaseline = o.baseline||"middle";
  if (o.shadow){
    ctx.save();
    ctx.shadowColor=o.shadow; ctx.shadowBlur=o.shadowBlur||10; ctx.shadowOffsetY=o.shadowY||2;
    ctx.fillText(out,x,y);
    ctx.restore();
  } else {
    ctx.fillText(out,x,y);
  }
  return size;
}
function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("show"),2400);
}
function status(msg,bad){
  const el=$("#status"); if(!el) return;
  el.textContent=msg||"";
  el.style.color = bad ? "var(--bad)" : "var(--muted)";
}

/* ============================================================
   一、数据模型
   ============================================================ */
const PALETTE = ["#e8b100","#2f6bff","#12a67a","#e8622a","#8b5cf6","#0ea5e9","#e11d74","#65a30d"];

function emptyP(){
  return { name:"", hero:"", k:"", d:"", a:"", cs:"", gpm:"", gold:"", goldShare:"",
           dmgPct:"", tankPct:"", kp:"", dmgPerGold:"", dmgWan:"" };
}
/** 每一行存「蓝方分路 pos」和「红方分路 posOpp」——两边各自独立，互不限制；
 *  出图时才按分路把两边配成一对（见 lanePair）。 */
function emptyRows(){ return POSITIONS.map(p => ({ pos:p, posOpp:p, our:emptyP(), opp:emptyP() })); }
function newGame(label, matchKey){
  return { id:uid(), label:label||"第1局", matchKey:matchKey||"", ourId:"", oppId:"", ourScore:"", oppScore:"",
           result:"win", date:"", duration:"", dmgBlue:"", dmgRed:"", rows:emptyRows() };
}
function newSeries(name){
  return { id:uid(), name:name||"新系列赛", teams:[], games:[newGame("第1局")], current:0, bracket:emptyBracket() };
}
function normTeam(t){
  // 前 5 个固定是 上单/打野/中路/发育路/游走，第 6 个起是替补（名单可以多带几个人，最多 12 个）
  const src = Array.isArray(t.players) ? t.players.slice(0, 12).map(x => String(x == null ? "" : x)) : [];
  while (src.length < 5) src.push("");
  return { id:t.id||uid(), name:t.name||"", color:t.color||PALETTE[0],
           eliminated:!!t.eliminated, note:t.note||"", group:t.group||"",
           players:src };
}
const ROSTER_MAX = 12;                       // 5 个位置 + 最多 7 个替补
function normPlayer(p){
  const o = emptyP();
  if (p) for (const k in o) if (p[k] !== undefined) o[k] = p[k];
  return o;
}
function normGame(g, i){
  return { id:g.id||uid(), label:g.label||("第"+(i+1)+"局"), matchKey:String(g.matchKey||""),
           ourId:g.ourId||"", oppId:g.oppId||"",
           ourScore:g.ourScore===undefined?"":String(g.ourScore), oppScore:g.oppScore===undefined?"":String(g.oppScore),
           result:g.result||"win", date:g.date||"", duration:g.duration||"",
           dmgBlue:g.dmgBlue===undefined?"":String(g.dmgBlue), dmgRed:g.dmgRed===undefined?"":String(g.dmgRed),
           rows:POSITIONS.map((p,j)=>{
             const raw = (g.rows && g.rows[j]) || {};
             return { pos: (raw.pos===undefined ? p : String(raw.pos||"")),
                      posOpp: (raw.posOpp===undefined ? (raw.pos===undefined ? p : String(raw.pos||"")) : String(raw.posOpp||"")),
                      our:normPlayer(raw.our), opp:normPlayer(raw.opp) };
           }) };
}
/** 对局时长（"12:11" / "12分11秒" / "12"）→ 分钟数 */
function durationMin(g){
  const s = String((g && g.duration) || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (m) return (+m[1]) + (+m[2])/60;
  m = s.match(/^(\d{1,2}(?:\.\d+)?)\s*(?:分|min|m)?/i);
  return m ? +m[1] : null;
}
/** 分均经济：优先用填写的值，否则用 总经济 ÷ 时长 推算 */
function effGpm(p, g){
  if (!isBlank(p.gpm)) return String(p.gpm).trim();
  const gold = parseNum(p.gold), min = durationMin(g);
  if (gold && min && min > 0) return String(Math.round(gold/min));
  return "";
}
/** 队伍总输出（万）→ 用于推算队员伤害 */
function teamDmgOf(g, side){ return g ? (side === "opp" ? g.dmgRed : g.dmgBlue) : ""; }
/** 全队总输出（万）：优先用「本局信息」里手填的；
 *  没填时用「任意一名选手的总输出万 ÷ 他的输出伤害占比」反推 —— 只填一个人的具体输出就能算出全队。 */
function teamTotalWan(g, side){
  const explicit = parseNum(teamDmgOf(g, side));
  if (explicit) return { wan: explicit, src: null };
  if (g && g.rows){
    for (const r of g.rows){
      const p = side === "opp" ? r.opp : r.our;
      const wan = parseNum(p.dmgWan), pct = parseNum(p.dmgPct);
      if (wan !== null && wan > 0 && pct !== null && pct > 0)
        return { wan: wan / (pct/100),
                 src: { name:p.name || (side === "opp" ? "红方某选手" : "蓝方某选手"), wan, pct } };
    }
  }
  return { wan: null, src: null };
}
/** 该选手总输出（万）：手填优先，否则用「全队总输出 × 他的输出伤害占比」推算 */
function effDmgWan(p, g, side){
  const own = parseNum(p.dmgWan);
  if (own !== null) return own;
  const total = teamTotalWan(g, side).wan;
  const pct = parseNum(p.dmgPct);
  if (total && pct !== null && pct > 0) return total * pct / 100;
  return null;
}
/** 万位数字显示：最多两位小数，去掉多余的 0 */
function fmtWan(v){
  if (v === null || v === undefined || !isFinite(v)) return "";
  return String(Math.round(v*100)/100);
}
/** 经济转英雄伤害 = 该选手对英雄伤害 ÷ 该选手总经济
 *  伤害来源优先级：手填的「经济转伤」> 该选手「总输出万」> 全队总输出 × 输出伤害占比 */
function effPerGold(p, g, side){
  if (!isBlank(p.dmgPerGold)) return String(p.dmgPerGold).trim();
  const gold = parseNum(p.gold);
  if (!gold) return "";
  const wan = effDmgWan(p, g, side);
  if (wan === null) return "";
  return ((wan*10000)/gold).toFixed(2);
}

let DB = {
  series: [], currentId: null,
  prefs: { theme:"light", chartStyle:"kpl", size:"1920x1080", footer:"厦门高中生王者荣耀电竞联赛 · 数据来自王者赛宝",
           values:true, overview:true, allGames:false, heroLift:"auto", bracket:false },
  heroPick: {}
};
let HEROES = null;
const ISSUE_FIX = {};
const ISSUE_BACK = {};

const S = {
  get series(){ return DB.series.find(s => s.id === DB.currentId) || DB.series[0]; },
  get game(){ const s = this.series; return s.games[clamp(s.current,0,s.games.length-1)] || s.games[0]; },
  team(id){ return this.series.teams.find(t => t.id === id) || { name:"", color:PALETTE[0], players:[] }; },
  get our(){ return this.team(this.game.ourId); },
  get opp(){ return this.team(this.game.oppId); }
};

function defaultSeries(){
  const s = newSeries("2026 薄扶林王者杯");
  s.teams = [
    normTeam({ name:"KHEL 长坂坡", color:"#e8b100" }),
    normTeam({ name:"BG 超会玩",   color:"#2f6bff" })
  ];
  s.games[0].ourId = s.teams[0].id;
  s.games[0].oppId = s.teams[1].id;
  return s;
}

/* ============================================================
   二、存储（有服务端存文件，没有则退回浏览器本地存储）
   ============================================================ */
/* 多标签页保护：每个 key 记住服务端内容哈希，保存时带上；冲突就停下并提示。 */
const STORE_REV = new Map();
const STORE_CONFLICT_KEYS = new Set(["library", "matches", "bracket", "heroPick"]);
let storeWriteBlocked = false;

function showStoreConflict(){
  storeWriteBlocked = true;
  if (document.getElementById("pkcConflict")) return;
  const el = document.createElement("div");
  el.id = "pkcConflict";
  el.className = "pkc-conflict";
  const span = document.createElement("span");
  span.textContent = "另一个标签页刚刚改过数据，本页的改动没有保存。";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "重新加载本页";
  btn.onclick = () => location.reload();
  el.append(span, btn);
  document.body.appendChild(el);
}

const STORE = {
  mode: "local",
  async init(){
    try {
      const r = await fetch("/api/ping", { cache:"no-store" });
      if (r.ok){ this.mode = "api"; return true; }
    } catch(e){}
    this.mode = "local";
    return false;
  },
  async load(key){
    if (this.mode === "api"){
      try {
        const r = await fetch("/api/store/"+key, {cache:"no-store"});
        const rev = r.headers.get("X-PKC-Rev");
        if (rev) STORE_REV.set(key, rev);
        return await r.json();
      } catch(e){ return null; }
    }
    try { const s = localStorage.getItem("pkc2_"+key); return s ? JSON.parse(s) : null; } catch(e){ return null; }
  },
  async save(key, data){
    if (this.mode === "api"){
      if (storeWriteBlocked) return;
      try {
        const headers = { "Content-Type":"application/json" };
        const base = STORE_REV.get(key);
        if (STORE_CONFLICT_KEYS.has(key) && base) headers["X-PKC-Base-Rev"] = base;
        const r = await fetch("/api/store/"+key, { method:"POST", headers, body:JSON.stringify(data) });
        if (r.status === 409){ showStoreConflict(); return; }
        const rev = r.headers.get("X-PKC-Rev");
        if (rev) STORE_REV.set(key, rev);
      }
      catch(e){ console.warn("保存失败", key, e); }
      return;
    }
    try { localStorage.setItem("pkc2_"+key, JSON.stringify(data)); } catch(e){ console.warn("本地存储已满", e); }
  }
};

let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 500);
}
async function saveAll(){
  if (storeWriteBlocked) return;
  await STORE.save("library", {
    currentId: DB.currentId,
    series: DB.series.map(s => ({ id:s.id, name:s.name, teams:s.teams }))
  });
  const games = {};
  DB.series.forEach(s => { games[s.id] = s.games; });
  await STORE.save("matches", { games });
  const brackets = {};
  DB.series.forEach(s => { brackets[s.id] = s.bracket || emptyBracket(); });
  await STORE.save("bracket", brackets);
  await STORE.save("prefs", DB.prefs);
  await STORE.save("heroPick", DB.heroPick);
  await STORE.save("context", contextSnapshot());
}

/* ---------- 当前场次上下文（生成器 → 导播台 / OBS） ---------- */
/**
 * 大场比分（这场 BO 里双方各赢了几局）和本场赛制。
 *
 * 取值顺序：
 *   ① 赛程表里手填 / 「回填赛果」写进去的比分 —— 导播的最终口径；
 *   ② 已录完的局次按 result 统计 —— 只在赛程没比分时兜底。
 * 统计时先排除「正在编辑的那一局」，避免刚开新局还没打完就被算成一胜；
 * 如果整场只有这一局，则仍然按它算。
 */
function seriesSummaryOf(g){
  const out = { blueWins:0, redWins:0, games:0, boFormat:0, source:"" };
  const s = S.series;
  if (!s || !g) return out;
  const m = (g.matchKey && typeof bkMatchByKey === "function") ? bkMatchByKey(g.matchKey) : null;
  if (m) out.boFormat = bkBoOf(m.round);

  const blueId = g.ourId || "", redId = g.oppId || "";
  const sc = m ? (B().score[m.key] || {}) : null;
  if (sc && (!isBlank(sc.a) || !isBlank(sc.b))){
    const a = Number(sc.a || 0) || 0, b = Number(sc.b || 0) || 0;
    if (blueId && m.a === blueId){ out.blueWins = a; out.redWins = b; }
    else if (blueId && m.b === blueId){ out.blueWins = b; out.redWins = a; }
    else { out.blueWins = a; out.redWins = b; }
    out.source = "赛程";
    return out;
  }

  const key = g.matchKey || "";
  const sameMatch = x => key
    ? (x.matchKey || "") === key
    : ((x.ourId === blueId && x.oppId === redId)
       || (x.ourId === redId && x.oppId === blueId));
  const list = (s.games || []).filter(x => sameMatch(x) && gameHasData(x));
  const done = list.filter(x => x !== S.game);
  const pool = done.length ? done : list;
  pool.forEach(x => {
    if (!x.result) return;
    out.games += 1;
    const winner = x.result === "win" ? x.ourId : (x.result === "lose" ? x.oppId : "");
    if (winner && winner === blueId) out.blueWins += 1;
    else if (winner && winner === redId) out.redWins += 1;
  });
  if (out.games) out.source = "已录局";
  return out;
}

function contextSnapshot(){
  const s = S.series, g = s && S.game;
  if (!s || !g) return null;
  const teams = s.teams || [];
  const nameOf = id => (teams.find(t => t.id === id) || {}).name || "";
  const m = (g.matchKey && typeof bkMatchByKey === "function") ? bkMatchByKey(g.matchKey) : null;
  const rec = seriesSummaryOf(g);
  return {
    seriesId: s.id,
    seriesName: s.name || "",
    matchKey: g.matchKey || "",
    matchLabel: m ? (m.code + " · " + (nameOf(m.a) || "待定") + " vs " + (nameOf(m.b) || "待定")) : (g.matchKey || ""),
    matchRound: m ? ((BK_ROUNDS[m.round] || {}).name || "") : "",
    gameId: g.id || "",
    gameLabel: g.label || "",
    blueId: g.ourId || "",
    redId: g.oppId || "",
    blueTeam: nameOf(g.ourId),
    redTeam: nameOf(g.oppId),
    blueScore: g.ourScore === undefined ? "" : String(g.ourScore),
    redScore: g.oppScore === undefined ? "" : String(g.oppScore),
    blueWins: rec.blueWins,
    redWins: rec.redWins,
    boFormat: rec.boFormat,
    scoreSource: rec.source,
    updatedAt: new Date().toISOString(),
  };
}

let ctxTimer = null;
function publishContext(delay){
  clearTimeout(ctxTimer);
  const send = () => {
    const ctx = contextSnapshot();
    if (!ctx) return;
    STORE.save("context", ctx);
    fetch("/api/director/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
    }).catch(() => {});
  };
  if (delay) ctxTimer = setTimeout(send, delay);
  else send();
}

/* ============================================================
   三、英雄图索引
   ============================================================ */
const IMG = {};                       // url -> Image
function getImg(url){
  if (!url) return null;
  if (IMG[url]) return IMG[url].img;
  const img = new Image();
  const rec = { img, ready:false };
  IMG[url] = rec;
  img.onload = () => { rec.ready = true; if (rec.cb) rec.cb(); };
  img.src = url;
  return img;
}

async function loadHeroes(refresh){
  if (STORE.mode !== "api"){ HEROES = null; return null; }
  try {
    HEROES = await (await fetch("/api/heroes" + (refresh ? "?refresh=1" : ""), { cache:"no-store" })).json();
    HERO_VER = HEROES.scannedAt || Date.now();      // 素材版本号：换图后靠它绕过浏览器缓存
    Object.keys(ISSUE_FIX).forEach(k => delete ISSUE_FIX[k]);
    Object.keys(ISSUE_BACK).forEach(k => delete ISSUE_BACK[k]);
    (HEROES.issues || []).forEach(it => {
      ISSUE_FIX[it.hero] = it.suggest || it.hero;
      if (it.suggest) ISSUE_BACK[it.suggest] = it.hero;   // 用正确英雄名也能找到「文件名写错」的图
    });
    return HEROES;
  } catch(e){ HEROES = null; return null; }
}

let HERO_VER = 0;
const verQS = () => HERO_VER ? ("?v=" + HERO_VER) : "";

function heroKey(name){ return String(name||"").replace(/\s+/g,"").trim(); }
/** 英雄 → 可打位置（第一个是默认位置，后面是备选）。
 *  这里只做“未指定分路”的补位，不覆盖手动选择；英雄改版后可在这里维护。 */
const HERO_LANES = (() => {
  const m = {};
  const add = (lane, list) => String(list).split(/\s+/).filter(Boolean).forEach(h => {
    if (!m[h]) m[h] = [];
    if (!m[h].includes(lane)) m[h].push(lane);
  });
  add("上单", "廉颇 白起 夏侯惇 吕布 曹操 典韦 宫本武藏 达摩 项羽 老夫子 关羽 程咬金 花木兰 杨戬 哪吒 铠 苏烈 梦奇 狂铁 孙策 李信 猪八戒 盘古 曜 马超 蒙恬 夏洛特 司空震 云缨 赵怀真 姬小满 亚连 海诺 大司命 影 亚瑟 钟无艳 芈月 元歌 刘备 元流之子(坦克) 孙权 蚩奼 心魔六耳 王维");
  add("打野", "赵云 韩信 兰陵王 娜可露露 橘右京 李白 露娜 阿轲 裴擒虎 百里玄策 云中君 镜 澜 暃 元流之子(刺客) 孙悟空 典韦 宫本武藏 铠 曜 盘古 云缨 大司命 司马懿 元歌 刘备");
  add("中路", "小乔 墨子 妲己 嬴政 高渐离 周瑜 甄姬 武则天 貂蝉 安琪拉 张良 王昭君 干将莫邪 女娲 弈星 米莱狄 沈梦溪 上官婉儿 西施 嫦娥 海月 金蝉 杨玉环 司马懿 元歌 不知火舞 元流之子(法师) 海诺 姜子牙 王维 卢雅那");
  add("发育路", "孙尚香 鲁班七号 马可波罗 狄仁杰 后羿 李元芳 虞姬 黄忠 百里守约 公孙离 伽罗 蒙犽 艾琳 戈娅 莱西奥 敖隐 元流之子(射手) 孙权 苍 蚩奼");
  add("游走", "庄周 刘禅 孙膑 扁鹊 蔡文姬 太乙真人 大乔 东皇太一 鬼谷子 瑶 明世隐 盾山 桑启 鲁班大师 朵莉亚 少司缘 空空儿 大禹 姜子牙 墨子 刘邦 苏烈 项羽 张飞 牛魔 钟馗");
  /* 这两个英雄在不同阵容里会上下路互换，优先按当前常见对位排列。 */
  m["刘邦"] = ["上单", "游走"];
  m["东皇太一"] = ["上单", "游走"];
  m["姜子牙"] = ["游走", "中路"];
  /* 「元流之子」本身不带职业后缀时，按版本常见的五种形态给候选。 */
  m["元流之子"] = ["打野", "中路", "发育路", "游走", "上单"];
  return m;
})();
function heroLaneOptions(name){
  return HERO_LANES[heroKey(name)] || [];
}

/** 返回该英雄名对应的候选文件列表（容错：文件名错字 / 元流之子变体） */
function heroCandidates(name){
  if (!HEROES || !HEROES.heroes) return [];
  const key = heroKey(name);
  if (!key) return [];
  const H = HEROES.heroes;
  if (H[key]) return H[key];
  const fixed = ISSUE_FIX[key];
  if (fixed && H[fixed]) return H[fixed];
  const back = ISSUE_BACK[key];
  if (back && H[back]) return H[back];
  const hits = Object.keys(H).filter(k => k.includes(key) || (back && back.includes(k)));
  return hits.length === 1 ? H[hits[0]] : [];
}

/** 该英雄当前选中的图（优先透明、优先优化过的 1024 图） */
function heroPickRec(name){
  const cands = heroCandidates(name);
  if (!cands.length) return null;
  const pick = DB.heroPick[heroKey(name)];
  let rec = pick ? cands.find(c => c.rel === pick) : null;
  if (!rec){
    rec = cands.find(c => c.alpha && c.format === "png") || cands.find(c => c.alpha) || cands[0];
  }
  return rec;
}
function heroFullURL(name){                     // 画图用
  const rec = heroPickRec(name);
  if (!rec) return null;
  return (rec.opt ? "/opt/" + encodeURI(rec.opt) : "/hero/" + encodeURI(rec.rel)) + verQS();
}
function heroThumbURL(name){                    // 列表用
  const rec = heroPickRec(name);
  if (!rec) return null;
  return (rec.thumb ? "/thumb/" + encodeURI(rec.thumb)
        : (rec.opt ? "/opt/"+encodeURI(rec.opt) : "/hero/"+encodeURI(rec.rel))) + verQS();
}
/** 任意可显示的地址：缩略图 → 优化图 → 原图（新素材还没生成缩略图时用原图顶一下） */
function recURL(rec){
  if (!rec) return null;
  if (rec.thumb) return "/thumb/" + encodeURI(rec.thumb) + verQS();
  if (rec.opt)   return "/opt/"   + encodeURI(rec.opt)   + verQS();
  return "/hero/" + encodeURI(rec.rel) + verQS();
}
function heroMissing(){
  if (!HEROES) return [];
  const used = new Set();
  DB.series.forEach(s => s.games.forEach(g => g.rows.forEach(r => {
    [r.our.hero, r.opp.hero].forEach(h => { if (!isBlank(h) && !heroCandidates(h).length) used.add(heroKey(h)); });
  })));
  return Array.from(used);
}

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
}

/* ============================================================
   六、标签页
   ============================================================ */
function switchTab(name){
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
  $$(".panel").forEach(p => p.classList.toggle("on", p.id === "panel-" + name));
  const wide = name === "bracket";                 // 赛程图很宽：这一页收起右侧预览，整页给赛程图
  $$(".layout").forEach(l => l.classList.toggle("single", wide));
  const pv = $("#preview");
  if (pv) pv.style.display = wide ? "none" : "";
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

/* ============================================================
   七、绘制（浅色为主，可切深色）
   ============================================================ */
const THEMES = {
  light: {
    isDark:false,
    bgTop:"#ffffff", bgBottom:"#f2f6fb",
    ink:"#111a26", sub:"#5a6a80", faint:"#93a3b8",
    headLine:"rgba(22,32,46,.13)", frame:"rgba(22,32,46,.14)",
    grid:"rgba(22,32,46,.10)", gridOut:"rgba(22,32,46,.20)",
    track:"rgba(22,32,46,.08)", shadow:"rgba(22,32,46,.12)"
  },
  dark: {
    isDark:true,
    bgTop:"#0f1622", bgBottom:"#080c14",
    ink:"#eef3fa", sub:"#9fb0c8", faint:"#7183a0",
    headLine:"rgba(255,255,255,.14)", frame:"rgba(255,255,255,.10)",
    grid:"rgba(255,255,255,.09)", gridOut:"rgba(255,255,255,.20)",
    track:"rgba(255,255,255,.08)", shadow:"rgba(0,0,0,.5)"
  }
};
const th = () => THEMES[DB.prefs.chartStyle === "kpl" ? "dark" :
  (DB.prefs.theme === "dark" ? "dark" : "light")];
/* 数据图上红蓝方一律用鲜蓝 / 鲜红（C_BLUE、C_RED）直接画，不再做「压深 / 变淡」处理 */

const PROC = {};      // url -> canvas（已自动抠掉纯色背景的版本）
const LUM = {};       // url -> 不透明区域平均亮度（0-255）
function getImgR(url, keyOut){
  if (!url) return null;
  if (PROC[url]) return PROC[url];
  if (IMG[url]){
    const r = IMG[url];
    if (keyOut && r.ready && !r.procDone) procKeyOut(url, r.img);
    return r.img;
  }
  const img = new Image();
  const rec = { img, ready:false, cb:() => scheduleRenderInput(0) };
  IMG[url] = rec;
  img.onload = () => {
    rec.ready = true;
    LUM[url] = measureLum(img);
    if (keyOut) procKeyOut(url, img); else if (rec.cb) rec.cb();
  };
  img.onerror = () => { rec.error = true; };
  img.src = url;
  return img;
}
/** 量一下这张立绘有多暗：缩到 48×48 取不透明像素的加权平均亮度 */
function measureLum(src){
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 48;
    const ctx = c.getContext("2d", { willReadFrequently:true });
    ctx.drawImage(src, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    let sum = 0, w = 0;
    for (let i=0;i<d.length;i+=4){
      const a = d[i+3]/255;
      if (a < 0.35) continue;
      sum += (0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]) * a;
      w += a;
    }
    return w > 0 ? sum/w : 255;
  } catch(e){ return 255; }
}
/** 暗立绘自动提亮：亮度越低提得越多；用户可整体关掉或加强 */
function liftOf(lum){
  const mode = DB.prefs.heroLift || "auto";
  if (mode === "off") return 1;
  const l = (lum === undefined || lum === null) ? 140 : lum;
  let f = 1;
  if (l < 55) f = 1.42;
  else if (l < 75) f = 1.30;
  else if (l < 100) f = 1.20;
  else if (l < 135) f = 1.11;
  else f = 1.03;
  return mode === "strong" ? Math.min(1.6, f*1.12) : f;
}
function liftCSS(lum){ const f = liftOf(lum); return f > 1.005 ? ("brightness("+f.toFixed(3)+")") : ""; }
function liftURL(url){ return liftOf(LUM[url]); }
/** 给页面上的小图（英雄网格 / 表格图标）套同样的提亮 */
function applyLiftEl(el){
  const go = () => { try { el.style.filter = liftCSS(measureLum(el)); } catch(e){} };
  if (el.complete && el.naturalWidth) go(); else el.onload = go;
}
/** 把「没有透明通道、四角又是同一种纯色」的图自动抠底（王维/兰陵王这类素材） */
function procKeyOut(url, img){
  const rec = IMG[url];
  if (!rec || rec.procDone) return;
  rec.procDone = true;
  try {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently:true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H);
    const px = (x,y) => { const i = (y*W+x)*4; return [d.data[i], d.data[i+1], d.data[i+2]]; };
    const cs = [px(2,2), px(W-3,2), px(2,H-3), px(W-3,H-3)];
    const avg = [0,1,2].map(k => cs.reduce((a,c2) => a + c2[k], 0)/4);
    const spread = Math.max.apply(null, cs.map(c2 => Math.abs(c2[0]-avg[0]) + Math.abs(c2[1]-avg[1]) + Math.abs(c2[2]-avg[2])));
    if (spread > 40){ PROC[url] = null; scheduleRenderInput(0); return; }   // 背景不是纯色，不动它
    const tol = 46*46*3;
    const seen = new Uint8Array(W*H);
    const stack = [];
    const match = p => {
      const i = p*4;
      const dr = d.data[i]-avg[0], dg = d.data[i+1]-avg[1], db = d.data[i+2]-avg[2];
      return dr*dr + dg*dg + db*db < tol;
    };
    const push = (x,y) => {
      if (x<0 || y<0 || x>=W || y>=H) return;
      const p = y*W + x;
      if (seen[p]) return;
      seen[p] = 1;
      if (!match(p)) return;
      d.data[p*4+3] = 0;
      stack.push(p);
    };
    for (let x=0;x<W;x++){ push(x,0); push(x,H-1); }
    for (let y=0;y<H;y++){ push(0,y); push(W-1,y); }
    while (stack.length){
      const p = stack.pop();
      const x = p % W, y = (p-x)/W;
      push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1);
    }
    ctx.putImageData(d, 0, 0);
    PROC[url] = c;
  } catch(e){ PROC[url] = null; }
  scheduleRenderInput(0);
}

/* 雷达七个维度：与「PKC 战报图」版式一致，其中第四项用 KDA 替代补刀数 */
const AXES = [
  { key:"kda",        name:"KDA",             unit:""  },
  { key:"dmgPct",     name:"伤害占比",         unit:"%" },
  { key:"tankPct",    name:"承伤占比",         unit:"%" },
  { key:"gpm",        name:"分均经济",         unit:""  },
  { key:"kp",         name:"参团率",           unit:"%" },
  { key:"dmgPerGold", name:"经济转英雄伤害",   unit:""  },
  { key:"k",          name:"击杀",             unit:""  }
];
const CMP_POOL = [
  { key:"gold",      name:"总经济",     unit:""  },
  { key:"dmgWan",    name:"总输出(万)", unit:""  },
  { key:"goldShare", name:"经济占比",   unit:"%" }
];
/** 取某个维度对某个选手的原始值与展示文本 */
function axisVal(p, key){
  if (key === "kda"){
    const k = parseNum(p.k), d = parseNum(p.d), a = parseNum(p.a);
    if (k === null && d === null && a === null) return { num:null, txt:"—" };
    const v = ((k||0) + (a||0)) / Math.max(1, d||0);
    return { num:v, txt: v.toFixed(1) };
  }
  if (key === "dmgPerGold"){
    const s = effPerGold(p), n = parseNum(s);
    return { num:n, txt: s || "—" };
  }
  const raw = p[key];
  const unit = (AXES.find(a => a.key === key) || {}).unit || "";
  return { num: parseNum(raw), txt: isBlank(raw) ? "—" : dispVal(raw, unit) };
}
function hasVal(row, k){
  const u = k === "kda" ? "k" : k;
  return !isBlank(row.our[u]) || !isBlank(row.opp[u]);
}
function cmpRowsFor(row){
  const used = new Set(AXES.map(a => a.key));
  const fresh = CMP_POOL.filter(c => hasVal(row, c.key) && !used.has(c.key));
  const rest  = CMP_POOL.filter(c => hasVal(row, c.key) && used.has(c.key));
  const out = fresh.slice(0, 3);
  if (out.length < 2) out.push.apply(out, rest.slice(0, 2 - out.length));
  return out;
}
/** 把「总经济 ÷ 对局时长」推算出的分均经济补进去，不动原始数据 */
function effRow(row, g){
  return { pos: row.pos, posOpp: row.posOpp,
    our: Object.assign({}, row.our, { gpm: effGpm(row.our, g), dmgPerGold: effPerGold(row.our, g, "our"),
      dmgWan: isBlank(row.our.dmgWan) ? fmtWan(effDmgWan(row.our, g, "our")) : String(row.our.dmgWan).trim() }),
    opp: Object.assign({}, row.opp, { gpm: effGpm(row.opp, g), dmgPerGold: effPerGold(row.opp, g, "opp"),
      dmgWan: isBlank(row.opp.dmgWan) ? fmtWan(effDmgWan(row.opp, g, "opp")) : String(row.opp.dmgWan).trim() }) };
}
/** 出图时的对位配对：左边找「蓝方分路=pos」的那位，右边找「红方分路=pos」的那位。
 *  两边分路各自指定、互不限制，所以可能出现一边有、一边没人（那就是空位）。 */
function lanePair(g, pos){
  const rows = (g && g.rows) || [];
  const ri = rows.findIndex(r => r.pos === pos);
  const rj = rows.findIndex(r => r.posOpp === pos);
  const a = ri >= 0 ? effRow(rows[ri], g) : null;
  const b = rj >= 0 ? effRow(rows[rj], g) : null;
  return { pos: pos,
           our: a ? a.our : emptyP(), opp: b ? b.opp : emptyP(),
           hasOur: !!a, hasOpp: !!b };
}
function normVals(row){
  const a = AXES.map(x => axisVal(row.our, x.key).num);
  const b = AXES.map(x => axisVal(row.opp, x.key).num);
  return {
    raw:{ our:a, opp:b },
    norm: AXES.map((x,i) => {
      const m = Math.max(a[i]||0, b[i]||0);
      return { our: m>0 ? (a[i]||0)/m : 0, opp: m>0 ? (b[i]||0)/m : 0 };
    })
  };
}
function gameHasData(g){
  if (!g || !Array.isArray(g.rows)) return false;
  return g.rows.some(r => [r.our,r.opp].some(p => p && (!isBlank(p.name) || !isBlank(p.hero) || !isBlank(p.k))));
}

/* ---------- 背景 ---------- */
function drawBG(ctx, ourColor, oppColor){
  const t = th();
  const g = ctx.createLinearGradient(0,0,0,DH);
  g.addColorStop(0, t.bgTop); g.addColorStop(1, t.bgBottom);
  ctx.fillStyle = g; ctx.fillRect(0,0,DW,DH);
  let rg = ctx.createRadialGradient(150,60,0,150,60,900);
  rg.addColorStop(0, rgba(ourColor, t.isDark?.30:.17)); rg.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0,0,DW,DH);
  rg = ctx.createRadialGradient(DW-150,DH-40,0,DW-150,DH-40,900);
  rg.addColorStop(0, rgba(oppColor, t.isDark?.24:.13)); rg.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0,0,DW,DH);
  ctx.save();
  ctx.globalAlpha = t.isDark ? .04 : .032;
  ctx.strokeStyle = t.isDark ? "#9fc3ff" : "#5b7ba8";
  ctx.lineWidth = 2;
  for (let i=-DH; i<DW; i+=70){ ctx.beginPath(); ctx.moveTo(i,DH); ctx.lineTo(i+DH,0); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = rgba(ourColor, t.isDark?.75:.9);
  ctx.fillRect(0,0,DW/2,5);
  ctx.fillStyle = rgba(oppColor, t.isDark?.75:.9);
  ctx.fillRect(DW/2,0,DW/2,5);
}

/* ---------- 顶部 ---------- */
function drawHead(ctx, our, opp, title, sub, badge){
  const t = th();
  // 三段文字（左队名 / 中间标题 / 右队名）各占一块互不重叠的位置，超长就缩字号 + 省略号
  const nameW = 380, nameX = 78 + 62 + 16;              // 队名从 x=156 开始
  const titleMax = Math.max(320, 2 * (DW/2 - (nameX + nameW + 24)));
  drawTeamBlock(ctx, our, 78, "left", nameW);
  drawTeamBlock(ctx, opp, DW-78, "right", nameW);
  fitText(ctx, title, 960, 46, { size:34, weight:"700", align:"center", color:t.ink, maxWidth:titleMax, spacing:2, minScale:.5 });
  fitText(ctx, sub, 960, 86, { size:22, align:"center", color:t.sub, maxWidth:titleMax });
  if (badge){
    const bw = 172, bh = 48, bx = 960-bw/2, by = 114;
    rr(ctx,bx,by,bw,bh,12);
    ctx.fillStyle = badge.win ? rgba(badge.color, t.isDark?.28:.16) : (t.isDark?"rgba(255,255,255,.08)":"rgba(22,32,46,.05)");
    ctx.fill();
    ctx.strokeStyle = badge.win ? badge.color : (t.isDark?"rgba(255,255,255,.3)":"rgba(22,32,46,.22)");
    ctx.lineWidth = 2; ctx.stroke();
    T(ctx, badge.text, 960, by+bh/2+1,
      { size:28, weight:"700", align:"center", family:FN, spacing:3, color: badge.win ? badge.color : t.sub });
  }
  ctx.fillStyle = t.headLine;
  ctx.fillRect(64, 190, DW-128, 1.5);
}
function drawTeamBlock(ctx, team, x, align, nameW){
  const t = th(), left = align === "left";
  const ls = 62, lx = left ? x : x-ls;
  ctx.save();
  ctx.shadowColor = t.shadow; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  rr(ctx,lx,34,ls,ls,14);
  const g = ctx.createLinearGradient(lx,34,lx+ls,34+ls);
  g.addColorStop(0, rgba(team.color,1)); g.addColorStop(1, rgba(team.color,.72));
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  FT(ctx, (team.name||"?").slice(0,2), lx+ls/2, 66,
    { size:20, weight:"700", align:"center", color: mixc(team.color,"#ffffff",.66), maxWidth:ls-10 });
  const tx = left ? x+ls+16 : x-ls-16;
  fitText(ctx, team.name || (left?"蓝方":"红方"), tx, 58,
    { size:34, weight:"700", align:align, color:t.ink, maxWidth:nameW || 420 });
  T(ctx, isBlank(team.score) ? "-" : String(team.score), tx, 132,
    { size:70, weight:"700", align:align, color:team.color, family:FN });
}

/* ---------- 双方选手块 ---------- */
function drawSide(ctx, x, y, w, player, color, tagLabel){
  const t = th();
  // 位置标签
  setFont(ctx, 22, "700", FC, 1);
  const cw = ctx.measureText(tagLabel).width + 34;
  rr(ctx, x, y, cw, 38, 10);
  ctx.fillStyle = rgba(color, t.isDark?.22:.15); ctx.fill();
  ctx.strokeStyle = rgba(color, .5); ctx.lineWidth = 1.6; ctx.stroke();
  T(ctx, tagLabel, x+cw/2, y+20, { size:22, weight:"700", align:"center", color:color });
  // 英雄半身像开窗（图片按比例铺满，底部压 KDA 条）
  const hw = w, hh = Math.round(w*1.30);
  const hy = y + 52;
  ctx.save();
  rr(ctx, x, hy, hw, hh, 18);
  ctx.clip();
  const g0 = ctx.createLinearGradient(x, hy, x, hy+hh);
  g0.addColorStop(0, t.isDark ? "rgba(255,255,255,.08)" : "#ffffff");
  g0.addColorStop(1, t.isDark ? "rgba(255,255,255,.03)" : "#e9eef7");
  ctx.fillStyle = g0; ctx.fillRect(x, hy, hw, hh);
  const url = heroFullURL(player.hero);
  const hrec = heroPickRec(player.hero);
  const img = url ? getImgR(url, !!(hrec && hrec.alpha === false)) : null;
  const isCanvas = typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement;
  const iw = isCanvas ? img.width : (img && img.naturalWidth);
  const ih = isCanvas ? img.height : (img && img.naturalHeight);
  if (img && iw && ih && !(IMG[url] && IMG[url].error)){
    const r = Math.max(hw/iw, hh/ih);            // cover：铺满窗口
    const dw = iw*r, dh = ih*r;
    const lf = liftOf(LUM[url]);
    ctx.save();
    if (lf > 1.005) ctx.filter = "brightness(" + lf.toFixed(3) + ")";
    ctx.drawImage(img, x+(hw-dw)/2, hy+(hh-dh)/2, dw, dh);
    ctx.restore();
  } else {
    FT(ctx, player.hero || "英雄", x+hw/2, hy+hh/2,
      { size:40, weight:"700", align:"center", color:t.isDark?"rgba(255,255,255,.25)":"#c6d2e2", maxWidth:hw-30 });
  }
  // 底部 KDA 压条
  const bh = 66;
  const g1 = ctx.createLinearGradient(0, hy+hh-bh, 0, hy+hh);
  g1.addColorStop(0, "rgba(8,14,24,0)");
  g1.addColorStop(0.55, "rgba(8,14,24,.62)");
  g1.addColorStop(1, "rgba(8,14,24,.88)");
  ctx.fillStyle = g1; ctx.fillRect(x, hy+hh-bh, hw, bh);
  [["击杀",player.k],["死亡",player.d],["助攻",player.a]].forEach((it,i) => {
    const cx = x + hw/6 + (hw/3)*i;
    T(ctx, isBlank(it[1]) ? "-" : String(it[1]).trim(), cx, hy+hh-36,
      { size:34, weight:"700", align:"center", family:FN, color: i===1 ? "#ff9fb2" : "#ffffff",
        shadow:"rgba(0,0,0,.45)", shadowBlur:7, shadowY:2 });
    T(ctx, it[0], cx, hy+hh-13, { size:13, align:"center", color:"rgba(255,255,255,.7)" });
  });
  ctx.restore();
  rr(ctx, x, hy, hw, hh, 18);
  ctx.strokeStyle = rgba(color, .55); ctx.lineWidth = 2; ctx.stroke();
  if (DB.prefs.chartStyle === "kpl"){
    ctx.save();
    ctx.globalAlpha = .72; ctx.strokeStyle = KPL_GOLD; ctx.lineWidth = 1.5;
    const ck = 22;
    [[x, hy, 1, 1], [x+hw, hy, -1, 1], [x, hy+hh, 1, -1], [x+hw, hy+hh, -1, -1]].forEach(([px,py,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(px+sx*ck, py); ctx.lineTo(px, py); ctx.lineTo(px, py+sy*ck); ctx.stroke();
    });
    ctx.restore();
  }
  // 姓名 / 英雄名
  fitText(ctx, player.name || "选手", x+hw/2, hy+hh+38, { size:40, weight:"700", align:"center", color:color,
    maxWidth:hw, spacing:.6, shadow:"rgba(0,0,0,.3)", shadowBlur:9, shadowY:2 });
  fitText(ctx, player.hero || "—", x+hw/2, hy+hh+72, { size:22, align:"center", color:t.sub, maxWidth:hw, minScale:.7 });
}

/* ---------- 雷达 ---------- */
function drawRadar(ctx, cx, cy, R, row, ourColor, oppColor){
  const t = th(), N = AXES.length;
  const ang = i => (-90 + i*(360/N)) * Math.PI/180;
  for (let r=1; r<=4; r++){
    const rr2 = R*r/4;
    ctx.beginPath();
    for (let i=0;i<N;i++){
      const a=ang(i), px=cx+Math.cos(a)*rr2, py=cy+Math.sin(a)*rr2;
      if (i) ctx.lineTo(px,py); else ctx.moveTo(px,py);
    }
    ctx.closePath();
    ctx.strokeStyle = r===4 ? t.gridOut : t.grid;
    ctx.lineWidth = r===4 ? 1.8 : 1;
    ctx.stroke();
  }
  for (let i=0;i<N;i++){
    const a=ang(i);
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
    ctx.strokeStyle = t.grid; ctx.lineWidth = 1; ctx.stroke();
  }
  if (DB.prefs.chartStyle === "kpl"){
    ctx.save();
    ctx.globalAlpha = .34; ctx.strokeStyle = KPL_GOLD; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R+10, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  const V = normVals(row);
  const pts = who => V.norm.map((v,i) => {
    const a=ang(i), rr2 = R*clamp(v[who],0,1);
    return [cx+Math.cos(a)*rr2, cy+Math.sin(a)*rr2];
  });
  const drawPoly = (p, color, fillA, lw, glow) => {
    ctx.save();
    if (glow){ ctx.shadowColor = rgba(color,.4); ctx.shadowBlur = 14; }
    ctx.beginPath();
    p.forEach((pt,i) => { if (i) ctx.lineTo(pt[0],pt[1]); else ctx.moveTo(pt[0],pt[1]); });
    ctx.closePath();
    ctx.fillStyle = rgba(color, fillA); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
    ctx.restore();
  };
  drawPoly(pts("opp"), oppColor, t.isDark?.20:.15, 2.4, false);
  drawPoly(pts("our"), ourColor, t.isDark?.32:.24, 3.4, true);
  pts("our").concat(pts("opp")).forEach(pt => {
    ctx.beginPath(); ctx.arc(pt[0],pt[1],4.5,0,Math.PI*2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.strokeStyle = t.frame; ctx.lineWidth = 1; ctx.stroke();
  });
  for (let i=0;i<N;i++){
    const a=ang(i), cos=Math.cos(a), sin=Math.sin(a);
    const lx = cx+cos*(R+54), ly = cy+sin*(R+54);
    const align = Math.abs(cos)<.22 ? "center" : (cos>0 ? "left" : "right");
    const ra0 = axisVal(row.our, AXES[i].key), rb0 = axisVal(row.opp, AXES[i].key);
    const empty = (ra0.num === null && rb0.num === null);
    T(ctx, AXES[i].name, lx, ly, { size:24, weight:"700", align:align, color: empty ? t.faint : t.sub, alpha: empty?0.75:1 });
    if (DB.prefs.values){
      const vy = sin>.5 ? ly+36 : (sin<-.5 ? ly-36 : ly+34);
      pairNum(ctx, lx, vy, ra0.txt, rb0.txt, align, 22,
        ourColor, oppColor, V.norm[i].our>=V.norm[i].opp, V.norm[i].opp>V.norm[i].our);
    }
  }
}
function pairNum(ctx,x,y,aTxt,bTxt,align,size,cA,cB,aWin,bWin){
  setFont(ctx,size,"700",FN,0);
  const wa = ctx.measureText(aTxt).width, wb = ctx.measureText(bTxt).width;
  const gap = size*.62, total = wa+gap+wb;
  const sx = align==="center" ? x-total/2 : (align==="right" ? x-total : x);
  ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillStyle = cA; ctx.fillText(aTxt, sx, y);          // 不再按胜负压暗：两侧都是鲜蓝 / 鲜红
  ctx.fillStyle = cB; ctx.fillText(bTxt, sx+wa+gap, y);
}

/* ---------- 底部对比 ---------- */
function drawCompare(ctx, row, ourColor, oppColor){
  const t = th();
  const rows = cmpRowsFor(row);
  if (!rows.length) return;
  ctx.fillStyle = t.headLine; ctx.fillRect(80, 820, DW-160, 1.5);
  rows.forEach((r,i) => {
    const y = 838 + i*64;
    const a = parseNum(row.our[r.key]), b = parseNum(row.opp[r.key]);
    const sa = a||0, sb = b||0, sum = sa+sb, ra = sum>0 ? sa/sum : .5;
    T(ctx, dispVal(row.our[r.key], r.unit), 806, y+14,
      { size:37, weight:"700", align:"right", color:ourColor, family:FN,
        shadow:"rgba(0,0,0,.3)", shadowBlur:6, shadowY:1 });
    T(ctx, r.name, 960, y+14, { size:20, weight:"500", align:"center", color:t.sub });
    T(ctx, dispVal(row.opp[r.key], r.unit), 1114, y+14,
      { size:37, weight:"700", align:"left", color:oppColor, family:FN,
        shadow:"rgba(0,0,0,.3)", shadowBlur:6, shadowY:1 });
    const bx0=88, bx1=DW-88, mid=960, maxL=mid-bx0;
    rr(ctx,bx0,y+42,bx1-bx0,11,6); ctx.fillStyle=t.track; ctx.fill();
    const la = maxL*ra, lb = maxL*(1-ra);
    if (la>2){ rr(ctx,mid-la,y+42,la,11,6); ctx.fillStyle=rgba(ourColor,.95); ctx.fill(); }
    if (lb>2){ rr(ctx,mid,y+42,lb,11,6); ctx.fillStyle=rgba(oppColor,.95); ctx.fill(); }
  });
}

/* ---------- KPL 单场数据面板风格 ---------- */
const KPL_GOLD = "#d8b35b";
const KPL_BLUE = "#7dc8ff";
const KPL_RED  = "#ff7588";

function drawKplBG(ctx){
  const g = ctx.createLinearGradient(0, 0, 0, DH);
  g.addColorStop(0, "#1b1b1f");
  g.addColorStop(.55, "#17171a");
  g.addColorStop(1, "#0d0e11");
  ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
  const vignette = ctx.createRadialGradient(DW/2, DH*.46, 140, DW/2, DH*.46, DW*.62);
  vignette.addColorStop(0, "rgba(255,255,255,.018)");
  vignette.addColorStop(.55, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, DW, DH);
  const blueGlow = ctx.createRadialGradient(190, 620, 0, 190, 620, 620);
  blueGlow.addColorStop(0, "rgba(42,116,210,.15)");
  blueGlow.addColorStop(1, "rgba(42,116,210,0)");
  ctx.fillStyle = blueGlow; ctx.fillRect(0, 120, DW/2, DH-120);
  const redGlow = ctx.createRadialGradient(DW-190, 620, 0, DW-190, 620, 620);
  redGlow.addColorStop(0, "rgba(190,55,78,.14)");
  redGlow.addColorStop(1, "rgba(190,55,78,0)");
  ctx.fillStyle = redGlow; ctx.fillRect(DW/2, 120, DW/2, DH-120);

  const l = ctx.createLinearGradient(0, 0, DW/2, 0);
  l.addColorStop(0, "rgba(47,95,158,.23)"); l.addColorStop(1, "rgba(47,95,158,0)");
  ctx.fillStyle = l; ctx.fillRect(0, 0, DW/2, 78);
  const r = ctx.createLinearGradient(DW/2, 0, DW, 0);
  r.addColorStop(0, "rgba(171,51,76,0)"); r.addColorStop(1, "rgba(171,51,76,.23)");
  ctx.fillStyle = r; ctx.fillRect(DW/2, 0, DW/2, 78);

  ctx.save();
  ctx.globalAlpha = .12; ctx.strokeStyle = "#bfc9d8"; ctx.lineWidth = 1;
  for (let x=-DH; x<DW+DH; x+=92){
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x+DH*.52, DH); ctx.stroke();
  }
  ctx.globalAlpha = .08; ctx.strokeStyle = KPL_GOLD;
  ctx.strokeRect(26.5, 92.5, DW-53, DH-119);
  ctx.globalAlpha = .42; ctx.strokeStyle = KPL_GOLD; ctx.lineWidth = 1.6;
  [[34,100,1,1],[DW-34,100,-1,1],[34,DH-34,1,-1],[DW-34,DH-34,-1,-1]].forEach(([x,y,sx,sy]) => {
    ctx.beginPath(); ctx.moveTo(x+sx*24, y); ctx.lineTo(x, y); ctx.lineTo(x, y+sy*24); ctx.stroke();
  });
  ctx.restore();
}

function drawKplHead(ctx, g, our, opp, row){
  const sa = parseNum(g.ourScore), sb = parseNum(g.oppScore);
  const blueWin = (sa !== null && sb !== null && sa !== sb) ? sa > sb : g.result === "win";
  const leftG = ctx.createLinearGradient(0, 0, DW/2, 0);
  leftG.addColorStop(0, "#487ba8"); leftG.addColorStop(1, "#304d68");
  const rightG = ctx.createLinearGradient(DW/2, 0, DW, 0);
  rightG.addColorStop(0, "#713441"); rightG.addColorStop(1, "#a3485a");
  ctx.fillStyle = leftG; ctx.fillRect(0, 0, DW/2, 72);
  ctx.fillStyle = rightG; ctx.fillRect(DW/2, 0, DW/2, 72);
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(DW/2-118, 0, 236, 72);
  ctx.fillStyle = KPL_GOLD; ctx.fillRect(DW/2-118, 0, 2, 72); ctx.fillRect(DW/2+116, 0, 2, 72);
  ctx.fillStyle = KPL_GOLD;
  ctx.fillRect(blueWin ? 0 : DW/2, 69, DW/2, 3);

  fitText(ctx, our.name || "蓝方", 66, 36, { size:34, weight:"700", color:"#f3f6fb", maxWidth:500,
    shadow:"rgba(0,0,0,.35)", shadowBlur:8, shadowY:2 });
  fitText(ctx, opp.name || "红方", DW-66, 36, { size:34, weight:"700", align:"right", color:"#f3f6fb", maxWidth:500,
    shadow:"rgba(0,0,0,.35)", shadowBlur:8, shadowY:2 });
  T(ctx, blueWin ? "胜利" : "失败", 330, 36, { size:21, weight:"700", spacing:1,
    color:blueWin ? "#d9f2ff" : "#e9b6c0" });
  T(ctx, blueWin ? "失败" : "胜利", DW-330, 36, { size:21, weight:"700", spacing:1,
    align:"right", color:blueWin ? "#e9b6c0" : "#d9f2ff" });
  T(ctx, String(g.label || "GAME"), DW/2, 20, { size:16, weight:"700", align:"center", color:KPL_GOLD, spacing:2 });
  T(ctx, (isBlank(g.ourScore) ? "-" : g.ourScore) + "  -  " + (isBlank(g.oppScore) ? "-" : g.oppScore),
    DW/2, 48, { size:25, weight:"700", align:"center", color:"#f5efe1", family:FN,
      shadow:"rgba(0,0,0,.4)", shadowBlur:7, shadowY:2 });

  ctx.fillStyle = "rgba(216,179,91,.7)"; ctx.fillRect(58, 84, DW-116, 1.2);
  T(ctx, row.label || ("赛后数据 · " + row.pos + "对位"), 60, 103,
    { size:17, weight:"700", color:"rgba(255,255,255,.68)", spacing:1 });
  T(ctx, S.series.name || "", DW-60, 103, { size:16, align:"right", color:"rgba(255,255,255,.46)", maxWidth:680 });
}

function drawKplStatChips(ctx, x, y, w, p, color, sideLabel){
  const t = th();
  rr(ctx, x, y, w, 138, 12);
  ctx.fillStyle = "rgba(255,255,255,.045)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = rgba(color, .85); ctx.fillRect(x, y, 4, 138);
  T(ctx, sideLabel, x+18, y+20, { size:16, weight:"800", color:KPL_GOLD, spacing:1.4 });
  const stats = [
    ["总经济", isBlank(p.gold) ? "—" : p.gold],
    ["输出", isBlank(p.dmgWan) ? "—" : fmtWan(p.dmgWan)+"万"],
    ["参团率", isBlank(p.kp) ? "—" : dispVal(p.kp, "%")],
    ["经济占比", isBlank(p.goldShare) ? "—" : dispVal(p.goldShare, "%")],
  ];
  stats.forEach((it, i) => {
    const cx = x + 20 + (i%2)*(w-40)/2;
    const cy = y + 54 + Math.floor(i/2)*40;
    T(ctx, it[0], cx, cy, { size:14, weight:"500", color:"rgba(255,255,255,.52)" });
    T(ctx, it[1], cx+82, cy, { size:18, weight:"700", color:"#f4f6fa", family:FN });
  });
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+18, y+94); ctx.lineTo(x+w-18, y+94); ctx.stroke();
  ctx.strokeStyle = "rgba(216,179,91,.55)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x+w-26, y+8); ctx.lineTo(x+w-8, y+8); ctx.lineTo(x+w-8, y+26); ctx.stroke();
}

function drawKplCard(ctx, g, posIdx){
  const our = S.team(g.ourId), opp = S.team(g.oppId);
  const pos = POSITIONS[posIdx] || POSITIONS[0], row = lanePair(g, pos);
  drawKplBG(ctx);
  drawKplHead(ctx, g, our, opp, row);
  const pw = 300;
  drawSide(ctx, 70, 120, pw, row.our, C_BLUE, pos + " · 蓝方" + (row.hasOur ? "" : "（未指定）"));
  drawSide(ctx, DW-70-pw, 120, pw, row.opp, C_RED, pos + " · 红方" + (row.hasOpp ? "" : "（未指定）"));
  const sa = parseNum(g.ourScore), sb = parseNum(g.oppScore);
  const blueWin = (sa !== null && sb !== null && sa !== sb) ? sa > sb : g.result === "win";
  const winX = blueWin ? 64 : DW-70-pw-6;
  ctx.save();
  ctx.strokeStyle = rgba(KPL_GOLD, .68); ctx.lineWidth = 2;
  rr(ctx, winX, 114, pw+12, 526, 18); ctx.stroke();
  ctx.restore();
  drawKplStatChips(ctx, 70, 650, pw, row.our, C_BLUE, "蓝方数据");
  drawKplStatChips(ctx, DW-70-pw, 650, pw, row.opp, C_RED, "红方数据");
  T(ctx, "对位雷达", 960, 158, { size:17, weight:"700", align:"center", color:"rgba(255,255,255,.56)", spacing:2 });
  drawRadar(ctx, 960, 505, 212, row, KPL_BLUE, KPL_RED);
  T(ctx, "核心数据对比", 960, 804, { size:16, weight:"700", align:"center", color:KPL_GOLD, spacing:2 });
  drawCompare(ctx, row, KPL_BLUE, KPL_RED);
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, 960, 1054, { size:17, align:"center", color:"rgba(255,255,255,.42)", maxWidth:DW-2*(70+360) });
  T(ctx, "数据来源：王者赛宝 / 手工核对", 70, 1052, { size:14, color:"rgba(255,255,255,.3)" });
  T(ctx, "PKC DATA · 单场", DW-70, 1052, { size:14, align:"right", color:KPL_GOLD, spacing:2 });
}

/* ---------- 单张对位图 ---------- */
function drawCard(ctx, g, posIdx){
  if (DB.prefs.chartStyle === "kpl") return drawKplCard(ctx, g, posIdx);
  const our = S.team(g.ourId), opp = S.team(g.oppId);
  const pos = POSITIONS[posIdx] || POSITIONS[0], row = lanePair(g, pos);
  const t = th();
  const blueWin = g.result === "win";
  drawBG(ctx, C_BLUE, C_RED);
  drawHead(ctx, Object.assign({}, our, { color:C_BLUE, score:g.ourScore }),
                Object.assign({}, opp, { color:C_RED,  score:g.oppScore }),
    S.series.name, [g.label, g.date].filter(Boolean).join("  ·  "),
    { text: blueWin ? "蓝方获胜" : "红方获胜", win:true, color: blueWin ? C_BLUE : C_RED });
  const pw = 306;
  drawSide(ctx, 84, 214, pw, row.our, C_BLUE, pos + " · 蓝方" + (row.hasOur ? "" : "（未指定）"));
  drawSide(ctx, DW-84-pw, 214, pw, row.opp, C_RED, pos + " · 红方" + (row.hasOpp ? "" : "（未指定）"));
  drawRadar(ctx, 960, 520, 205, row, C_BLUE, C_RED);
  drawCompare(ctx, row, C_BLUE, C_RED);
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, 960, 1056, { size:21, align:"center", color:t.faint, maxWidth:DW-2*(84+430) });
  T(ctx, (our.name||"蓝方"), 84, 1056, { size:19, color:C_BLUE, maxWidth:420 });
  T(ctx, (opp.name||"红方"), DW-84, 1056, { size:19, align:"right", color:C_RED, maxWidth:420 });
}

/* ---------- 五路总览 ---------- */
function drawOverview(ctx, g){
  if (DB.prefs.chartStyle === "kpl") return drawKplOverview(ctx, g);
  const our = S.team(g.ourId), opp = S.team(g.oppId), t = th();
  const blueWin = g.result === "win";
  drawBG(ctx, C_BLUE, C_RED);
  drawHead(ctx, Object.assign({}, our, { color:C_BLUE, score:g.ourScore }),
                Object.assign({}, opp, { color:C_RED,  score:g.oppScore }),
    S.series.name + " · 五路总览", [g.label, g.date].filter(Boolean).join("  ·  "),
    { text: blueWin ? "蓝方获胜" : "红方获胜", win:true, color: blueWin ? C_BLUE : C_RED });
  const n = POSITIONS.length, gap = 18, margin = 64;
  const tileW = (DW - margin*2 - gap*(n-1))/n, tileY = 222, tileH = 792;
  POSITIONS.forEach((pos, i) => {
    const row = lanePair(g, pos);            // 按分路配对，而不是按行号
    const x = margin + i*(tileW+gap), cx = x + tileW/2;
    rr(ctx, x, tileY, tileW, tileH, 18);
    ctx.fillStyle = t.isDark ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.78)";
    ctx.fill();
    ctx.strokeStyle = t.frame; ctx.lineWidth = 1.5; ctx.stroke();
    setFont(ctx, 22, "700", FC, 1);
    const cw = ctx.measureText(pos).width + 34;
    rr(ctx, cx-cw/2, tileY+18, cw, 36, 10);
    ctx.fillStyle = rgba(C_BLUE, t.isDark?.25:.15); ctx.fill();
    ctx.strokeStyle = rgba(C_BLUE, .45); ctx.lineWidth = 1.4; ctx.stroke();
    T(ctx, pos, cx, tileY+37, { size:22, weight:"700", align:"center", color:C_BLUE });
    drawRadarMini(ctx, cx, tileY+250, 88, row, C_BLUE, C_RED);   // 半径收小一点，给完整维度名留位置
    fitText(ctx, row.our.name || (row.hasOur ? "—" : "（未指定）"), cx, tileY+420, { size:29, weight:"700", align:"center", color:C_BLUE, maxWidth:tileW-40, minScale:.62 });
    T(ctx, "KDA " + kdaText(row.our), cx, tileY+458, { size:24, align:"center", color:C_BLUE, family:FN });
    ctx.fillStyle = t.frame; ctx.fillRect(x+22, tileY+486, tileW-44, 1);
    fitText(ctx, row.opp.name || (row.hasOpp ? "—" : "（未指定）"), cx, tileY+522, { size:29, weight:"700", align:"center", color:C_RED, maxWidth:tileW-40, minScale:.62 });
    T(ctx, "KDA " + kdaText(row.opp), cx, tileY+560, { size:24, align:"center", color:C_RED, family:FN });
    [["kp","参团率"],["dmgPct","伤害占比"]].forEach(([k,label], ki) => {
      const yy = tileY+636 + ki*62;
      T(ctx, dispVal(row.our[k],"%"), x+24, yy, { size:28, weight:"700", color:C_BLUE, family:FN });
      T(ctx, label, cx, yy, { size:19, align:"center", color:t.sub });
      T(ctx, dispVal(row.opp[k],"%"), x+tileW-24, yy, { size:28, weight:"700", align:"right", color:C_RED, family:FN });
    });
  });
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, 960, 1054, { size:21, align:"center", color:t.faint, maxWidth:DW-200 });
}

function drawKplOverview(ctx, g){
  const our = S.team(g.ourId), opp = S.team(g.oppId);
  drawKplBG(ctx);
  drawKplHead(ctx, g, our, opp, { pos:"五路", label:"五路总览" });
  const margin = 38, gap = 12;
  const tileW = (DW - margin*2 - gap*(POSITIONS.length-1))/POSITIONS.length;
  const tileY = 126, tileH = 796;
  POSITIONS.forEach((pos, i) => {
    const row = lanePair(g, pos);
    const x = margin + i*(tileW+gap), cx = x + tileW/2;
    /* 每路一张独立的蓝红卡片，底色先把双方区分开。 */
    const bg = ctx.createLinearGradient(x, tileY, x+tileW, tileY);
    bg.addColorStop(0, "rgba(60,112,170,.20)");
    bg.addColorStop(.5, "rgba(255,255,255,.035)");
    bg.addColorStop(1, "rgba(160,55,74,.20)");
    rr(ctx, x, tileY, tileW, tileH, 14); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = rgba(C_BLUE, .9); ctx.fillRect(x+16, tileY+14, tileW-32, 3);
    T(ctx, pos, cx, tileY+38, { size:24, weight:"800", align:"center", color:"#f4f7fb", spacing:2 });
    T(ctx, "BLUE", x+22, tileY+64, { size:12, weight:"700", color:KPL_BLUE, spacing:1.5 });
    T(ctx, "RED", x+tileW-22, tileY+64, { size:12, weight:"700", align:"right", color:KPL_RED, spacing:1.5 });
    ctx.fillStyle = rgba(KPL_BLUE, .5); ctx.fillRect(x+1, tileY+18, 2, tileH-36);
    ctx.fillStyle = rgba(KPL_RED, .5); ctx.fillRect(x+tileW-3, tileY+18, 2, tileH-36);
    drawRadarMini(ctx, cx, tileY+155, 72, row, KPL_BLUE, KPL_RED, false);
    const hs = 42;
    drawOverviewHero(ctx, x+24, tileY+250, hs, row.our.hero, KPL_BLUE);
    fitText(ctx, row.our.name || (row.hasOur ? "—" : "（未指定）"), x+78, tileY+267,
      { size:23, weight:"700", color:KPL_BLUE, maxWidth:tileW-100, minScale:.6 });
    fitText(ctx, row.our.hero || "—", x+78, tileY+292,
      { size:16, weight:"500", color:"rgba(255,255,255,.66)", maxWidth:tileW-100, minScale:.7 });
    T(ctx, "KDA " + kdaText(row.our), x+78, tileY+316,
      { size:18, weight:"700", color:"#eaf4ff", family:FN });
    drawOverviewHero(ctx, x+tileW-66, tileY+326, hs, row.opp.hero, KPL_RED);
    fitText(ctx, row.opp.name || (row.hasOpp ? "—" : "（未指定）"), x+tileW-78, tileY+347,
      { size:23, weight:"700", align:"right", color:KPL_RED, maxWidth:tileW-100, minScale:.6 });
    fitText(ctx, row.opp.hero || "—", x+tileW-78, tileY+372,
      { size:16, weight:"500", align:"right", color:"rgba(255,255,255,.66)", maxWidth:tileW-100, minScale:.7 });
    T(ctx, "KDA " + kdaText(row.opp), x+tileW-78, tileY+396,
      { size:18, weight:"700", align:"right", color:"#fff0f2", family:FN });
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x+20, tileY+420, tileW-40, 1);
    [
      ["参团率", "kp"],
      ["伤害占比", "dmgPct"],
      ["经济占比", "goldShare"],
    ].forEach(([label,key], n) => {
      const y = tileY+442 + n*70;
      const a = parseNum(row.our[key]), b = parseNum(row.opp[key]);
      overviewPairBar(ctx, x+24, y, tileW-48, label, a, b);
    });
    T(ctx, "经济 " + (isBlank(row.our.gold) ? "—" : row.our.gold), x+24, tileY+690,
      { size:15, weight:"600", color:"rgba(255,255,255,.66)", family:FN });
    T(ctx, (isBlank(row.opp.gold) ? "—" : row.opp.gold), x+tileW-24, tileY+690,
      { size:15, weight:"600", align:"right", color:"rgba(255,255,255,.66)", family:FN });
    T(ctx, "输出 " + (isBlank(row.our.dmgWan) ? "—" : fmtWan(row.our.dmgWan)+"万"), x+24, tileY+726,
      { size:15, weight:"600", color:"rgba(255,255,255,.66)", family:FN });
    T(ctx, (isBlank(row.opp.dmgWan) ? "—" : fmtWan(row.opp.dmgWan)+"万"), x+tileW-24, tileY+726,
      { size:15, weight:"600", align:"right", color:"rgba(255,255,255,.66)", family:FN });
  });
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, 960, 1054,
    { size:17, align:"center", color:"rgba(255,255,255,.42)", maxWidth:DW-200 });
}

function drawOverviewHero(ctx, x, y, size, hero, color){
  rr(ctx, x, y, size, size, 10);
  ctx.fillStyle = "rgba(255,255,255,.055)"; ctx.fill();
  ctx.strokeStyle = rgba(color, .62); ctx.lineWidth = 1.4; ctx.stroke();
  const url = heroThumbURL(hero);
  const img = url ? getImgR(url) : null;
  const iw = img && (img.naturalWidth || img.width);
  const ih = img && (img.naturalHeight || img.height);
  if (img && iw && ih){
    ctx.save();
    rr(ctx, x+2, y+2, size-4, size-4, 8); ctx.clip();
    const box = size-4;
    const scale = Math.max(box/iw, box/ih);
    const dw = iw*scale, dh = ih*scale;
    ctx.drawImage(img, x+2+(box-dw)/2, y+2+(box-dh)/2, dw, dh);
    ctx.restore();
  } else {
    T(ctx, (hero || "?").slice(0,1), x+size/2, y+size/2+1,
      { size:20, weight:"700", align:"center", color:rgba(color,.8) });
  }
}

function overviewPairBar(ctx, x, y, w, label, a, b){
  const av = Math.max(0, Math.min(100, a === null ? 0 : a));
  const bv = Math.max(0, Math.min(100, b === null ? 0 : b));
  T(ctx, label, x+w/2, y, { size:16, weight:"700", align:"center", color:"rgba(255,255,255,.72)", spacing:.5 });
  T(ctx, a === null ? "—" : dispVal(a,"%"), x, y+28, { size:22, weight:"700", color:KPL_BLUE, family:FN });
  T(ctx, b === null ? "—" : dispVal(b,"%"), x+w, y+28, { size:22, weight:"700", align:"right", color:KPL_RED, family:FN });
  const total = av + bv;
  const ratio = total > 0 ? av/total : .5;
  rr(ctx, x, y+46, w, 12, 6); ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fill();
  if (ratio > 0.01){
    rr(ctx, x, y+46, Math.max(2, w*ratio), 12, 6); ctx.fillStyle = KPL_BLUE; ctx.fill();
  }
  if (ratio < 0.99){
    const right = w*(1-ratio);
    rr(ctx, x+w-right, y+46, Math.max(2, right), 12, 6); ctx.fillStyle = KPL_RED; ctx.fill();
  }
}
function kdaText(p){
  const f = v => isBlank(v) ? "-" : String(v).trim();
  return f(p.k)+"/"+f(p.d)+"/"+f(p.a);
}
function drawRadarMini(ctx, cx, cy, R, row, ourColor, oppColor, showLabels = true){
  const t = th(), N = AXES.length, ang = i => (-90+i*(360/N))*Math.PI/180;
  for (let r=1;r<=3;r++){
    const rr2 = R*r/3;
    ctx.beginPath();
    for (let i=0;i<N;i++){
      const a=ang(i), px=cx+Math.cos(a)*rr2, py=cy+Math.sin(a)*rr2;
      if (i) ctx.lineTo(px,py); else ctx.moveTo(px,py);
    }
    ctx.closePath();
    ctx.strokeStyle = r===3 ? t.gridOut : t.grid; ctx.lineWidth = 1; ctx.stroke();
  }
  const V = normVals(row);
  const pts = who => V.norm.map((v,i) => {
    const a=ang(i), rr2=R*clamp(v[who],0,1);
    return [cx+Math.cos(a)*rr2, cy+Math.sin(a)*rr2];
  });
  [[pts("opp"),oppColor,.18,2.7],[pts("our"),ourColor,.28,2.6]].forEach(([p,color,fa,lw]) => {
    ctx.beginPath();
    p.forEach((pt,i) => { if (i) ctx.lineTo(pt[0],pt[1]); else ctx.moveTo(pt[0],pt[1]); });
    ctx.closePath();
    ctx.fillStyle = rgba(color,fa); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  });
  // 维度名要写全（以前是 K/杀/伤/承/经/团/转 单字，看不出是什么维度）
  const LABEL = { kda:"KDA", k:"击杀", dmgPct:"伤害占比", tankPct:"承伤占比",
                  gpm:"分均经济", kp:"参团率", dmgPerGold:"经济转伤" };
  if (!showLabels) return;
  for (let i=0;i<N;i++){
    const a=ang(i), cos=Math.cos(a), sin=Math.sin(a);
    const align = Math.abs(cos)<.22 ? "center" : (cos>0 ? "left" : "right");
    T(ctx, LABEL[AXES[i].key] || AXES[i].name, cx+cos*(R+22), cy+sin*(R+22),
      { size:15, align:align, color:t.sub });
  }
}

/* ---------- 多局对比 ---------- */
function multiGames(){
  const key = S.game ? (S.game.matchKey || "") : "";
  return S.series.games.filter(g => (g.matchKey || "") === key && gameHasData(g));
}
function gamesForExport(allGames){
  return allGames ? multiGames() : [S.game];
}
function drawMulti(ctx){
  const s = S.series, t = th();
  const games = multiGames();
  const base = games[0] || s.games[0];
  const our = S.team(base.ourId), opp = S.team(base.oppId);
  drawBG(ctx, C_BLUE, C_RED);
  const winN = games.filter(g => g.result === "win").length;
  drawHead(ctx, Object.assign({}, our, { color:C_BLUE, score: winN }), Object.assign({}, opp, { color:C_RED, score: games.length - winN }),
    s.name + " · 多局对比",
    games.length + " 局有效数据  ·  蓝方 " + winN + " 胜 " + (games.length-winN) + " 负", null);
  if (!games.length){
    T(ctx, "还没有录入任何一局的数据", 960, 560, { size:38, align:"center", color:t.faint });
    return;
  }
  const x0 = 64, x1 = DW-64, labelW = 210, headY = 208, headH = 56;
  const colW = (x1 - x0 - labelW) / games.length;
  T(ctx, "位置 / 选手", x0+6, headY+24, { size:20, weight:"700", color:t.sub });
  games.forEach((g,i) => {
    const cx = x0 + labelW + colW*i + colW/2;
    T(ctx, g.label, cx, headY+14, { size:23, weight:"700", align:"center", color:t.ink });
    T(ctx, (isBlank(g.ourScore)?"-":g.ourScore) + " : " + (isBlank(g.oppScore)?"-":g.oppScore),
      cx, headY+40, { size:18, align:"center", color: g.result==="win" ? C_BLUE : C_RED });
    if (i){ ctx.fillStyle = t.frame; ctx.fillRect(x0+labelW+colW*i, headY, 1, DH-headY-70); }
  });
  ctx.fillStyle = t.headLine; ctx.fillRect(x0, headY+headH, x1-x0, 1.5);
  const rowTop = headY + headH + 10;
  const rowH = (DH - 108 - rowTop) / POSITIONS.length;
  POSITIONS.forEach((pos, ri) => {
    const y = rowTop + ri*rowH;
    if (ri){ ctx.fillStyle = t.frame; ctx.fillRect(x0, y, x1-x0, 1); }
    const first = lanePair(games[0], pos);
    T(ctx, pos, x0+6, y+rowH*0.32, { size:25, weight:"700", color:t.ink });
    fitText(ctx, first.our.name || (first.hasOur ? "—" : "（未指定）"), x0+6, y+rowH*0.58, { size:18, color:C_BLUE, maxWidth:labelW-16 });
    fitText(ctx, first.opp.name || (first.hasOpp ? "—" : "（未指定）"), x0+6, y+rowH*0.82, { size:18, color:C_RED, maxWidth:labelW-16 });
    games.forEach((g,i) => {
      const row = lanePair(g, pos);
      const cx = x0 + labelW + colW*i + colW/2;
      T(ctx, kdaText(row.our), cx, y+rowH*0.29, { size:27, weight:"700", align:"center", color:C_BLUE, family:FN });
      T(ctx, kdaText(row.opp), cx, y+rowH*0.56, { size:23, align:"center", color:C_RED, family:FN });
      const a = parseNum(row.our.dmgPct)||0, b = parseNum(row.opp.dmgPct)||0, sum = a+b;
      if (sum > 0){
        const bw = colW - 64, bx = cx - bw/2, by = y + rowH*0.73;
        rr(ctx,bx,by,bw,9,5); ctx.fillStyle = t.track; ctx.fill();
        const la = bw*(a/sum);
        if (la > 1){ rr(ctx,bx,by,la,9,5); ctx.fillStyle = rgba(C_BLUE,.92); ctx.fill(); }
        ctx.fillStyle = t.faint; ctx.fillRect(cx, by-3, 1, 15);
      }
      const kpA = parseNum(row.our.kp), kpB = parseNum(row.opp.kp);
      const kpY = y + rowH*0.89;
      T(ctx, "参团率", cx, kpY, { size:15, align:"center", color:t.faint });
      T(ctx, (kpA===null?"-":kpA+"%"), cx-32, kpY, { size:15, align:"right", color:C_BLUE, family:FN });
      T(ctx, (kpB===null?"-":kpB+"%"), cx+32, kpY, { size:15, align:"left",  color:C_RED,  family:FN });
    });
  });
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, 960, 1054, { size:21, align:"center", color:t.faint, maxWidth:DW-200 });
}

/* ============================================================
   八、预览与渲染
   ============================================================ */
const PREVIEW_Q = 0.5;
function makeCanvas(w,h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function renderInto(canvas, kind, g, rowIdx, w, h){
  if (canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  const sc = w / DW;
  ctx.setTransform(sc,0,0,sc,0,0);
  if (kind === "card") drawCard(ctx, g, rowIdx);
  else if (kind === "overview") drawOverview(ctx, g);
  else drawMulti(ctx);
}
function targetSize(){
  const p = String(DB.prefs.size).split("x").map(Number);
  return [p[0]||1920, p[1]||1080];
}
function sanitizeName(s){ return String(s||"").replace(/[\\/:*?"<>|\s]+/g,"_") || "PKC"; }
function fileBase(i){
  const g = S.game, our = S.team(g.ourId), opp = S.team(g.oppId);
  return sanitizeName([ (our.name||"蓝方")+"_vs_"+(opp.name||"红方"), S.series.name, g.label,
                        i>=0 ? POSITIONS[i] : "五路总览" ].filter(Boolean).join("_"));
}

const shots = [];
function buildPreview(){
  const host = $("#preview");
  host.innerHTML = ""; shots.length = 0;
  const [W,H] = targetSize();
  const pw = Math.round(W*PREVIEW_Q), ph = Math.round(H*PREVIEW_Q);
  POSITIONS.forEach((pos, i) => {
    const shot = document.createElement("div");
    shot.className = "shot";
    shot.innerHTML = '<div class="shot-h"><b>'+pos+' 对位图</b><span>'+W+'×'+H+'</span><button class="mini">下载</button></div>';
    const cv = makeCanvas(pw, ph);
    shot.appendChild(cv);
    host.appendChild(shot);
    const rec = { kind:"card", idx:i, canvas:cv, name:fileBase(i) + ".png" };
    shot.querySelector("button").onclick = () => downloadOne(rec, pos + " 对位图");
    shots.push(rec);
  });
  if (DB.prefs.overview){
    const shot = document.createElement("div");
    shot.className = "shot";
    shot.innerHTML = '<div class="shot-h"><b>五路总览</b><span>'+W+'×'+H+'</span><button class="mini">下载</button></div>';
    const cv = makeCanvas(pw, ph);
    shot.appendChild(cv);
    host.appendChild(shot);
    const rec = { kind:"overview", idx:-1, canvas:cv, name:fileBase(-1) + ".png" };
    shot.querySelector("button").onclick = () => downloadOne(rec, "五路总览");
    shots.push(rec);
  }
}

let renderTimer = null;
function scheduleRenderInput(ms){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, ms === undefined ? 150 : ms);
}
function renderPreview(){
  const [W,H] = targetSize();
  const pw = Math.round(W*PREVIEW_Q), ph = Math.round(H*PREVIEW_Q);
  const t0 = performance.now();
  shots.forEach(s => {
    if (s.kind === "card") renderInto(s.canvas, "card", S.game, s.idx, pw, ph);
    else if (s.kind === "overview") renderInto(s.canvas, "overview", S.game, -1, pw, ph);
  });
  status("已刷新 · " + Math.round(performance.now()-t0) + "ms");
}

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

/* ============================================================
   十一、截图识别（本地 tesseract，需通过 启动.bat 打开）
   ============================================================ */
let ocrW = null;
/** 最近一次识别的中间产物，方便排查「为什么没认出来」 */
let ocrDebug = null;
/** 最近一次客户端页解析用的裁块与拼版画布（同样只用于排查） */
let clientDebug = null;
const ocrMsg = m => { const el = $("#ocrMsg"); if (el) el.textContent = m; };
const ocrPct = p => { const el = $("#ocrBar"); if (el) el.style.width = Math.round(p*100) + "%"; };

function loadTesseract(){
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement("script");
    s.src = "/assets/tesseract/tesseract.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error("OCR 引擎加载失败（需要用 启动.bat 打开）"));
    document.head.appendChild(s);
  });
}
/* ---------- 英雄头像特征库：把赛宝页面上的英雄图标比成英雄名 ---------- */
let ICONS = null;
function loadIconFeatures(){
  return new Promise(resolve => {
    if (ICONS) return resolve(ICONS);
    const ready = () => {
      const g = window.HERO_ICON;
      if (!g){ ICONS = null; return resolve(null); }
      const bin = atob(g.data);
      const arr = new Int8Array(bin.length);
      for (let i=0;i<bin.length;i++) arr[i] = (bin.charCodeAt(i) << 24) >> 24;
      ICONS = { names:g.names, n:g.n, data:arr, dim:g.n*g.n*3, scale:g.scale || 1 };
      resolve(ICONS);
    };
    if (window.HERO_ICON) return ready();
    const s = document.createElement("script");
    s.src = "/assets/hero-features.js";
    s.onload = ready;
    s.onerror = () => { ICONS = null; resolve(null); };
    document.head.appendChild(s);
  });
}
/** 把图上的一块裁剪转成与特征库同口径的向量 */
function iconFeature(src, box){
  const N = ICONS.n;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const mean = [0,0,0];
  const px = N*N;
  for (let i=0;i<px;i++){ mean[0]+=d[i*4]; mean[1]+=d[i*4+1]; mean[2]+=d[i*4+2]; }
  for (let k=0;k<3;k++) mean[k] /= px;
  const sd = [0,0,0];
  for (let i=0;i<px;i++) for (let k=0;k<3;k++){ const v = d[i*4+k]-mean[k]; sd[k] += v*v; }
  for (let k=0;k<3;k++) sd[k] = Math.sqrt(sd[k]/px) + 1e-6;
  const f = new Float32Array(px*3);
  for (let i=0;i<px;i++) for (let k=0;k<3;k++) f[i*3+k] = (d[i*4+k]-mean[k]) / sd[k];
  return f;
}
/** 返回 {name, score, margin}；score 越高越可信（实测 >2 很可靠） */
function matchHeroIcon(src, box){
  if (!ICONS) return null;
  const f = iconFeature(src, box), dim = ICONS.dim;
  const k = ICONS.scale || 1;                 // 特征库里是 int8 量化过的，除回去才是可比分数
  let best = -1e9, second = -1e9, bi = -1;
  for (let h=0; h<ICONS.names.length; h++){
    const off = h*dim;
    let dot = 0;
    for (let i=0;i<dim;i++) dot += f[i] * ICONS.data[off+i];
    if (dot > best){ second = best; best = dot; bi = h; }
    else if (dot > second) second = dot;
  }
  return { name: ICONS.names[bi], score: best/dim*3/k, margin: (best-second)/dim*3/k };
}
function longestRun(arr, n, thr){
  let s = -1, best = null;
  for (let i=0;i<n;i++){
    if (arr[i] >= thr){ if (s < 0) s = i; }
    else if (s >= 0){ if (!best || (i-s) > (best[1]-best[0])) best = [s,i]; s = -1; }
  }
  if (s >= 0 && (!best || (n-s) > (best[1]-best[0]))) best = [s,n];
  return best;
}
/** 在指定区域内找出英雄头像方框（图标是彩色方块，背景是浅灰） */
function detectIconBox(src, x0, y0, x1, y1){
  const w = Math.round(x1-x0), h = Math.round(y1-y0);
  if (w < 20 || h < 20) return null;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.drawImage(src, Math.round(x0), Math.round(y0), w, h, 0, 0, w, h);
  const d = ctx.getImageData(0,0,w,h).data;
  const rowF = new Int32Array(h), colF = new Int32Array(w);
  const isInk = i => {
    const R = d[i], G = d[i+1], B = d[i+2];
    const mx = Math.max(R,G,B), mn = Math.min(R,G,B);
    return (mx - mn > 28) || ((R+G+B)/3 < 195);
  };
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (isInk((y*w+x)*4)) rowF[y]++;
  const rows = longestRun(rowF, h, w*0.32);
  if (!rows) return null;
  for (let y=rows[0];y<rows[1];y++) for (let x=0;x<w;x++) if (isInk((y*w+x)*4)) colF[x]++;
  const cols = longestRun(colF, w, (rows[1]-rows[0])*0.45);
  if (!cols) return null;
  const bw = cols[1]-cols[0], bh = rows[1]-rows[0];
  if (bw < 20 || bh < 20) return null;
  if (bw/bh < 0.5 || bw/bh > 2) return null;
  return { x: Math.round(x0)+cols[0], y: Math.round(y0)+rows[0], w: bw, h: bh };
}
/** 先定位头像方框，再匹配；定位失败时退回小范围滑动 */
function matchHeroIconNear(src, cx, cy, S, side){
  const W = src.width;
  let best = null, bestBox = null;
  // 实测：赛宝页头像中心在「该行文字中心」上方约 0.022 屏宽处，这里再上下微调取最像的
  const baseY = cy - W*0.022;
  [-0.024, -0.012, 0, 0.012, 0.024, -0.036, 0.036].forEach(dy => {
    const box = { x: Math.round(cx - S/2), y: Math.round(baseY + dy*W - S/2), w: Math.round(S), h: Math.round(S) };
    if (box.x < 0 || box.y < 0 || box.x + box.w > src.width || box.y + box.h > src.height) return;
    const m = matchHeroIcon(src, box);
    if (m && (!best || m.score > best.score)){ best = m; bestBox = box; }
  });
  return best ? { name:best.name, score:best.score, margin:best.margin, box:bestBox } : null;
}
async function ocrWorkerGet(){
  if (ocrW) return ocrW;
  await loadTesseract();
  ocrW = await window.Tesseract.createWorker("chi_sim+eng", 1, {
    workerPath: "/assets/tesseract/worker.min.js",
    corePath: "/assets/tesseract/",
    langPath: "/assets/tesseract/lang",
    gzip: true,
    logger: m => {
      if (m.status === "recognizing text") ocrMsg("识别中… " + Math.round((m.progress||0)*100) + "%");
      else if (m.status) ocrMsg(m.status + " " + Math.round((m.progress||0)*100) + "%");
      ocrPct(m.progress || 0);
    }
  });
  return ocrW;
}
function pageSizeFromTSV(tsv){
  const line = String(tsv||"").split(/\r?\n/).find((l,i) => i > 0 && l.split("\t")[0] === "1");
  const c = line ? line.split("\t") : [];
  return { w: +c[8] || 1200, h: +c[9] || 1000 };
}
function wordsFromTSV(tsv){
  const out = [];
  String(tsv||"").split(/\r?\n/).forEach((ln, idx) => {
    if (idx === 0) return;
    const c = ln.split("\t");
    if (c.length < 12 || +c[0] !== 5) return;
    const conf = parseFloat(c[10]);
    const txt = (c[11]||"").trim();
    if (!txt || (conf === conf && conf < 20)) return;
    const x = +c[6], y = +c[7], w = +c[8], h = +c[9];
    out.push({ text:txt, x, y, w, h, cx:x+w/2, cy:y+h/2, conf: conf===conf ? conf : 0 });
  });
  return out;
}
function clusterRows(words){
  const ws = words.slice().sort((a,b) => a.cy-b.cy || a.cx-b.cx);
  const rows = [];
  ws.forEach(w => {
    const row = rows.find(r => Math.abs(r.cy - w.cy) < Math.max(12, Math.max(w.h, r.h)*0.6));
    if (row){
      row.words.push(w);
      row.cy = (row.cy*(row.words.length-1) + w.cy) / row.words.length;
      row.h = Math.max(row.h, w.h);
    } else rows.push({ cy:w.cy, h:w.h, words:[w] });
  });
  rows.forEach(r => {
    r.words.sort((a,b) => a.cx-b.cx);
    r.cx = (r.words[0].cx + r.words[r.words.length-1].cx)/2;
  });
  return rows.filter(r => r.words.length >= 2);
}
/** 整页分栏：赛宝战绩页通常是左右两栏表格，先按空白竖带切开，避免两边数据串行 */
function splitLanes(words, imgW){
  if (words.length < 10) return null;
  const B = 10, nb = Math.ceil(imgW/B), occ = new Array(nb).fill(0);
  words.forEach(w => {
    const a = Math.max(0, Math.floor(w.x/B)), b = Math.min(nb-1, Math.floor((w.x+w.w)/B));
    for (let i=a; i<=b; i++) occ[i]++;
  });
  let best = null, start = -1;
  const lo = Math.floor(nb*0.28), hi = Math.ceil(nb*0.72);
  for (let i=lo; i<hi; i++){
    if (occ[i] === 0){ if (start < 0) start = i; }
    else if (start >= 0){
      if (!best || (i-start) > best.len) best = { s:start, e:i, len:i-start };
      start = -1;
    }
  }
  if (start >= 0 && (!best || (hi-start) > best.len)) best = { s:start, e:hi, len:hi-start };
  if (!best || best.len*B < 36) return null;
  const cut = (best.s + best.e)/2 * B;
  const left = words.filter(w => w.cx < cut), right = words.filter(w => w.cx >= cut);
  if (left.length < 4 || right.length < 4) return null;
  return { cut, left, right };
}
function findHeroIn(text){
  if (!HEROES) return "";
  const t = String(text).replace(/\s/g,"");
  let best = "";
  Object.keys(HEROES.heroes).forEach(h => { if (h.length > best.length && t.includes(h)) best = h; });
  return best;
}
function rowToLine(r, side){
  const texts = [], nums = [];
  for (let i=0;i<r.words.length;i++){
    const w = r.words[i], t = w.text.replace(/\s/g,"");
    if (/^\d+(\.\d+)?$/.test(t)){
      const nx = r.words[i+1];
      if (nx && nx.text.replace(/\s/g,"") === "%"){ nums.push(t+"%"); i++; }
      else nums.push(t);
    } else if (/^\d+(\.\d+)?%$/.test(t)) nums.push(t);
    else if (/^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(t)) nums.push(t);
    else if (!/^[%\-—]+$/.test(t)) texts.push(t);
  }
  const joined = texts.join("");
  const hero = findHeroIn(joined);
  let name = joined;
  if (hero){ name = joined.split(hero).join("").replace(/[（(].*?[)）]/g,"").trim(); }
  name = name.replace(/上单|打野|中路|发育路|游走|对抗路|辅助|射手|中单|边路/g,"").trim();
  if (name && !/^[\u4e00-\u9fa5A-Za-z0-9_\-\u00b7]{1,14}$/.test(name)) name = "";
  if (!hero && !name) return "";
  if (nums.length < 3) return "";
  return [side === "our" ? "蓝方" : "红方", name, hero].filter(Boolean).join("\t") + "\t" + nums.join("\t");
}
/* ---------- 赛宝「数据」页版式解析：选手行 + 4 条百分比行，左右两侧 ---------- */
const SB_STATS = [
  { re:/输出伤害|输出/, key:"dmgPct" },
  { re:/承受伤害|承受|承伤/, key:"tankPct" },
  { re:/经济占比/, key:"goldShare" },
  { re:/参团率|参团/, key:"kp" }
];
function sbLabelKey(t){
  const s = String(t).replace(/\s/g,"");
  for (const l of SB_STATS) if (l.re.test(s)) return l.key;
  return null;
}
function isNoiseText(t){
  return /^[%\-—·.]+$/.test(t) || /MVP|胜利|暂无|回放|全局BP|总览|资源|禁用|选择|数据|输出伤害|承受伤害|经济占比|参团率/i.test(t);
}
/** 名字：OCR 常把中文名拆成单字，这里把相邻片段拼起来，并优先取含中文的。
 *  allow = 两支队伍名单里的人名（归一化后）。赛宝上的「昵称」和我们名单里的 ID 不是一回事，
 *  所以英文/数字串只有确实是我们名单里的选手才认，否则宁可留空，也不要把赛宝 ID 当成选手名塞进去。 */
function joinName(ws, side, mid, allow){
  let list = ws.filter(w => /[\u4e00-\u9fa5A-Za-z]/.test(w.text)
                        && !isNoiseText(w.text) && (w.conf === undefined || w.conf >= 45));
  list = list.filter(w => side === "our" ? w.cx < mid : w.cx >= mid).sort((a,b) => a.cx-b.cx);
  // 1) 中文名：OCR 常把一个名字拆成单字，按整列顺序拼起来
  const cnList = list.filter(w => /[\u4e00-\u9fa5]/.test(w.text));
  const cn = cnList.map(w => w.text.replace(/[^\u4e00-\u9fa5]/g, "")).join("").slice(0, 14);
  if (cn.length >= 2) return cn;              // 单字多半是噪声，宁可留空
  // 2) 英文/符号 ID：允许 game-ID 常见的 _ . ^ - 组合，不再要求先命中队伍名单
  const latin = list
    .map(w => ({ t:cliClean(w.text), conf:w.conf || 0 }))
    .filter(o => /^[A-Za-z][A-Za-z0-9_.^\-]{1,20}$/.test(o.t) && o.conf >= 45)
    .sort((a,b) => b.t.length - a.t.length)[0];
  return latin ? latin.t : "";
}
function mergeKdaWords(words){
    const out = [];
  for (let i=0;i<words.length;i++){
    const t = words[i].text.replace(/\s/g,"");
    const prev = out[out.length-1];
    if (/^[\/\\|]$/.test(t) && prev && /^\d{1,3}$/.test(prev.text) && words[i+1] && /^\d{1,3}$/.test(words[i+1].text.replace(/\s/g,""))){
      prev.text = prev.text + "/" + words[i+1].text.replace(/\s/g,"");
      prev.cx = (prev.cx + words[i+1].cx)/2;
      i++;
    } else out.push({ text:t, cx:words[i].cx, x:words[i].x, h:words[i].h, conf:words[i].conf });
  }
  return out;
}
function kdaToken(t){
  const m = String(t).replace(/\s/g,"").match(/^(\d{1,2})[\/\\|](\d{1,2})[\/\\|](\d{1,2})$/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** 返回 {blocks:[{our,opp}], duration} */
function parseSaibaoBlocks(rows, page){
  const allow = new Set();      // 名单里的人名：英文 ID 只有确实是我们的人才认
  [S.our, S.opp].forEach(t => ((t && t.players) || []).forEach(n => { const k = normPlayerName(n); if (k) allow.add(k); }));
  const mid = page.w/2, blocks = [];
  let cur = null, duration = "";
  rows.forEach(r => {
    const ws = mergeKdaWords(r.words);
    const lineText = ws.map(w => w.text).join("");
    const dt = lineText.match(/(\d{1,2})[:：](\d{2})/);
    if (dt && r.cy < page.h*0.28 && r.cy > page.h*0.02){   // 排除手机状态栏时间
      duration = dt[1] + ":" + dt[2];                       // 取该区域内最靠下的一处
    }

    const kdas = [];
    ws.forEach(w => { const k = kdaToken(w.text); if (k) kdas.push({ k, cx:w.cx }); });
    const pcts = ws.filter(w => /^\d+(\.\d+)?%?$/.test(w.text)).map(w => ({ v:(w.text.match(/\d+(\.\d+)?/)||[])[0], cx:w.cx, pct:/%/.test(w.text) }));

    // 统计行：有标签 + 两个百分比
    const labelKeys = sbLabelKey(lineText) ? [sbLabelKey(lineText)] : [];
    const isStatRow = labelKeys.length >= 1 && pcts.length >= 2 && kdas.length === 0;
    if (isStatRow && cur){
      const key = labelKeys[0];
      const sorted = pcts.slice().sort((a,b) => a.cx-b.cx);
      const our = sorted[0], opp = sorted[sorted.length-1];
      if (our && cur.our[key] === undefined) cur.our[key] = our.v;
      if (opp && cur.opp[key] === undefined) cur.opp[key] = opp.v;
      return;
    }

    // 选手行：两个 KDA（或一个 KDA + 名字）
    if (kdas.length >= 1){
      const texts = ws.filter(w => /[\u4e00-\u9fa5A-Za-z]/.test(w.text) && !isNoiseText(w.text));
      const golds = ws.filter(w => /^\d{3,5}$/.test(w.text)).map(w => ({ v:+w.text, cx:w.cx }));
      const leftK = kdas.filter(x => x.cx < mid).sort((a,b)=>b.cx-a.cx)[0];
      const rightK = kdas.filter(x => x.cx >= mid).sort((a,b)=>a.cx-b.cx)[0];
      const leftG = golds.filter(x => x.cx < mid).sort((a,b)=>b.cx-a.cx)[0];
      const rightG = golds.filter(x => x.cx >= mid).sort((a,b)=>a.cx-b.cx)[0];
      const leftName = joinName(ws, "our", mid, allow);
      const rightName = joinName(ws, "opp", mid, allow);
      cur = { cy:r.cy, our:{}, opp:{} };
      if (leftK)  Object.assign(cur.our, { k:leftK.k[0],  d:leftK.k[1],  a:leftK.k[2] });
      if (rightK) Object.assign(cur.opp, { k:rightK.k[0], d:rightK.k[1], a:rightK.k[2] });
      if (leftG)  cur.our.gold = String(leftG.v);
      if (rightG) cur.opp.gold = String(rightG.v);
      if (leftName)  cur.our.name = leftName;
      if (rightName) cur.opp.name = rightName;
      blocks.push(cur);
    }
  });
  // 丢掉没取到数据的空块
  return { blocks: blocks.filter(b => b.our.k !== undefined || b.our.gold || b.opp.k !== undefined), duration };
}
/* ---------- 识别双方队伍：队名 / 比分 / 获胜方 / 对局时长 ---------- */
function headerName(ws, side, page){
  let list = ws.filter(w => /[\u4e00-\u9fa5]/.test(w.text) && !isNoiseText(w.text)
                        && (w.conf === undefined || w.conf >= 30));
  list = list.filter(w => side === "our" ? w.cx < page.w*0.45 : w.cx > page.w*0.55)
             .sort((a,b) => a.cx - b.cx);
  const s = list.map(w => w.text).join("").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g,"");
  return s.slice(0, 12);
}
function parseSaibaoHeader(rows, page){
  const out = { blueName:"", redName:"", blueScore:"", redScore:"", blueWin:null, duration:"" };
  const SKIP = /禁用|选择|资源|总览|数据|回放|直播|模式|暂不|全局/;
  const top = rows.filter(r => r.cy < page.h*0.20);
  top.forEach(r => {
    const t = r.words.map(w => w.text).join("");
    const m = t.match(/(\d{1,2})[:：](\d{2})/);
    if (m && r.cy > page.h*0.02) out.duration = m[1] + ":" + m[2];
  });
  let best = null;
  top.forEach(r => {
    const t = r.words.map(w => w.text).join("");
    if (SKIP.test(t)) return;
    const left = headerName(r.words, "our", page), right = headerName(r.words, "opp", page);
    if (left.length >= 2 && right.length >= 2 && (!best || left.length + right.length > best.len)){
      best = { r, left, right, len:left.length + right.length };
    }
  });
  if (best){
    out.blueName = best.left; out.redName = best.right;
    const nums = best.r.words.filter(w => /^\d{1,3}$/.test(w.text.trim()))
                   .map(w => ({ v:w.text.trim(), cx:w.cx })).sort((a,b) => a.cx - b.cx);
    if (nums.length >= 2){ out.blueScore = nums[0].v; out.redScore = nums[nums.length-1].v; }
  }
  const winTok = [];
  top.forEach(r => r.words.forEach(w => { if (/胜利|获胜/.test(w.text)) winTok.push(w); }));
  if (winTok.length){
    const cx = winTok[0].cx;
    if (cx > page.w*0.5) out.blueWin = false;       // 胜利徽章在右侧 → 红方赢
    else if (cx < page.w*0.5) out.blueWin = true;
  }
  return out;
}
function applySaibaoHeader(hdr){
  const s = S.series, g = S.game;
  const norm = x => String(x||"").replace(/[\s　]+/g,"");
  const findTeam = name => {
    const n = norm(name);
    if (!n) return null;
    return s.teams.find(t => {
      const tn = norm(t.name);
      return (tn && tn === n) ||
             (tn.length >= 2 && (tn.includes(n) || n.includes(tn)));
    }) || null;
  };
  const added = [];
  const ensure = (name, color) => {
    const n = norm(name);
    if (n.length < 2 || n.length > 14) return null;
    const t = normTeam({ name:n, color });
    s.teams.push(t); added.push(n);
    return t;
  };
  let blue = findTeam(hdr.blueName), red = findTeam(hdr.redName);
  if (!blue && hdr.blueName) blue = ensure(hdr.blueName, "#2f6bff");
  if (!red && hdr.redName)  red  = ensure(hdr.redName, "#e5484d");
  if (blue) g.ourId = blue.id;
  if (red)  g.oppId = red.id;
  if (hdr.blueScore !== "") g.ourScore = hdr.blueScore;
  if (hdr.redScore !== "")  g.oppScore = hdr.redScore;
  if (hdr.blueWin !== null) g.result = hdr.blueWin ? "win" : "lose";
  else {
    const a = parseNum(g.ourScore), b = parseNum(g.oppScore);
    if (a !== null && b !== null && a !== b) g.result = a > b ? "win" : "lose";
  }
  if (hdr.duration) g.duration = hdr.duration;
  return { blue, red, added, result:g.result };
}
function guessSides(rows, imgW){
  const marks = rows.map(r => { const t = r.words.map(w => w.text).join(""); return /我方|蓝色方/.test(t) ? "our" : (/对方|敌方|红色方/.test(t) ? "opp" : null); });
  if (marks.some(m => m === "our") && marks.some(m => m === "opp")) return null;   // 页面自带标记，交给解析器
  const usable = rows.filter(r => r.words.length >= 3);
  if (usable.length >= 6){
    const xs = usable.map(r => r.cx).sort((a,b) => a-b);
    const mid = imgW/2;
    const left = usable.filter(r => r.cx < mid).length, right = usable.length - left;
    if (left >= 3 && right >= 3) return r => r.cx < mid ? "our" : "opp";           // 左右两栏
  }
  const half = Math.ceil(usable.length/2);
  return r => (usable.indexOf(r) < half ? "our" : "opp");                          // 上下两段
}

/* ---------- 王者荣耀客户端「战绩」页版式 ----------
 * 客户端不给队名，只有双方各 5 名选手；两张页签各承担一半数据：
 *   装备页：英雄立绘（左下角压着名字）/ 评分 / 段位徽章 + 昵称 / KDA / 总经济 / 装备
 *   数据页：英雄立绘 / 评分 / 徽章 + 昵称 / 输出伤害 / 承受伤害 / 总经济 / 参团率（各带一条占比条）
 * 版式固定（左右两栏、五行等高），所以列按实测比例取、行由 OCR 行聚类定位。
 * 英雄名是白色小字压在立绘上，整页 OCR 读不出来，单独裁竖条做一次二值化识别。
 */
const CLI = {
  nick: { our:[0.190, 0.330], opp:[0.520, 0.680] },     // 昵称列（找行锚的兜底来源）
  /* 昵称实际文字区：去掉左侧段位徽章和右侧装备图标，单独给名字 OCR 用。 */
  nickCrop: { our:[0.230, 0.350], opp:[0.525, 0.675] },
  kda:  { our:[0.300, 0.415], opp:[0.760, 0.865] },     // KDA 数字
  num:  { our:[0.312, 0.470], opp:[0.760, 0.912] },     // 装备页要认的一整段（KDA + 总经济）
  stat: { our:[0.190, 0.500], opp:[0.640, 0.920] },     // 数据页要认的一整段（数值 + 占比）
  /* 数据页四列（输出伤害 / 承受伤害 / 总经济 / 参团率）与装备页 KDA / 总经济各占的 x 段：
     按列落位，某一列没认出来只会留空，不会把后面的数字串到前面去。 */
  statCols: { our:[[0.190,0.272],[0.272,0.332],[0.332,0.402],[0.402,0.500]],
              opp:[[0.640,0.740],[0.740,0.802],[0.802,0.870],[0.870,0.925]] },
  /* 裁块用的真实列边界。上面的 statCols 保留给整页兜底解析；这里只框数字/百分比，
     避免把头像、昵称和相邻列带进格子。 */
  statCrop: { our:[[0.215,0.280],[0.280,0.340],[0.340,0.400],[0.400,0.465]],
              opp:[[0.650,0.715],[0.715,0.785],[0.785,0.850],[0.850,0.925]] },
  numCols:  { our:{ kda:[0.300,0.398], gold:[0.396,0.470] },
              opp:{ kda:[0.755,0.847], gold:[0.842,0.912] } },
  hero: { our:[0.042, 0.090], opp:[0.496, 0.548] },     // 英雄立绘左下角的名字小字
  heroDy: [0.030, 0.100],                               // 名字相对「该行文字行」的纵向范围
  rowLo: 0.16, rowHi: 0.80,                             // 只在这个纵向范围内找行
  /* 行锚到「这行文字」的纵向距离：数据页的锚是占比条里的百分数（比文字行低），
     装备页的锚是 KDA 数字（和文字同一行，只差半个字高）。 */
  statDy: 0.058, kdaDy: 0.010,
  statLabels:["输出伤害","承受伤害","总经济","参团率"],
};
const cliClean = s => String(s == null ? "" : s).replace(/\s/g, "");
/** 33.7k → 33700（容忍 OCR 在数字前后多带一两个符号；数值太离谱时按少点了一位小数点处理） */
function cliKilo(t){
  const s = cliClean(t);
  if (s.length > 8) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[kK]/);
  if (!m) return null;
  let v = Math.round(parseFloat(m[1]) * 1000);
  if (v > 200000) v = Math.round(v / 10);          // 315k 其实是 31.5k（小数点被吞）
  return v;
}
/** 26% → 26（同样容忍前后多带的符号；超过 100 的直接丢） */
function cliPct(t){
  const s = cliClean(t);
  if (s.length > 8) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 100 ? null : v;
}
const cliInCol = (w, r, W) => w.cx >= r[0]*W && w.cx <= r[1]*W;

/** 是不是客户端战绩页（赛宝那页的表头写的是「经济占比」，客户端写「总经济」） */
function looksLikeClient(words, page){
  const all = words.map(w => cliClean(w.text)).join("");
  if (/创建房间|建房间|查看回放|局内表现|更多/.test(all)) return true;
  if (all.includes("总经济") && !all.includes("经济占比")) return true;
  /* 没有界面字样时看列：KDA 落在客户端的列上就算（装备页整页只有 KDA 和总经济是数字） */
  const inKdaCol = w => cliInCol(w, CLI.kda.our, page.w) || cliInCol(w, CLI.kda.opp, page.w);
  const kdaTok = words.filter(w => kdaToken(w.text));
  if (kdaTok.length >= 3 && kdaTok.filter(inKdaCol).length >= Math.ceil(kdaTok.length * 0.7)) return true;
  const digits = words.filter(w => /^\d{1,2}$/.test(cliClean(w.text)) && inKdaCol(w)).length;
  return digits >= 8;
}
const clientIsStats = words => {
  const all = words.map(w => cliClean(w.text)).join("");
  return all.includes("总经济") && !all.includes("经济占比");
};

/** 把 OCR 出来的英雄名小字对到英雄表：先精确、再包含、单字要唯一、最后按字相似度兜一步 */
function snapHeroName(t){
  if (!HEROES || !HEROES.heroes) return "";
  const s = cliClean(t).replace(/[^\u4e00-\u9fa5]/g, "");
  if (s.length < 1 || s.length > 6) return "";
  const H = HEROES.heroes;
  if (H[s]) return s;
  const keys = Object.keys(H);
  /* 单字：只有唯一一个英雄名含这个字才认（「飞」→ 张飞 ✓，「海」→ 海月/海诺 ✗ 放弃） */
  if (s.length === 1){
    const hits = keys.filter(k => k.includes(s));
    return hits.length === 1 ? hits[0] : "";
  }
  /* 小字 OCR 常把首字认错但尾字保留，例如「度姬」→「虞姬」。
     只有尾字唯一的英雄才接受，避免把两个相似名字硬配错。 */
  if (s.length >= 2){
    const tail = keys.filter(k => k.length === s.length && k[k.length-1] === s[s.length-1]);
    if (tail.length === 1) return tail[0];
  }
  let best = "";
  keys.forEach(k => { if (k.length >= 2 && (s.includes(k) || k.includes(s)) && k.length > best.length) best = k; });
  if (best) return best;
  let bestK = "", bestScore = 0;
  keys.forEach(k => {
    if (Math.abs(k.length - s.length) > 1) return;
    const n = Math.min(k.length, s.length);
    let same = 0;
    for (let i=0;i<n;i++) if (k[i] === s[i]) same++;
    const score = same / Math.max(k.length, s.length);
    if (score > bestScore){ bestScore = score; bestK = k; }
  });
  return (bestScore >= 0.66 || (bestScore >= 0.5 && bestK[0] === s[0])) ? bestK : "";
}
/** 同一格有多个版本（原图 / 二值化 / 低饱和 / 另一页）：按票数取最可信的。
 *  小字容易被认成别的英雄名，所以只出现一次、又不是精确命中的，宁可留空让导播手填。 */
function pickHeroCandidate(texts){
  const votes = new Map();
  (texts || []).forEach(t => {
    const s = cliClean(t).replace(/[^\u4e00-\u9fa5]/g, "");
    const hero = snapHeroName(t);
    if (!hero || !s) return;
    let rank = 1;
    if (s === hero) rank = 3;                 // 两个字都对上
    else if (s.includes(hero)) rank = 2;      // 名字整段出现在 OCR 文本里
    const v = votes.get(hero) || { n:0, rank:0 };
    v.n += 1;
    v.rank = Math.max(v.rank, rank);
    votes.set(hero, v);
  });
  let best = "", bestScore = -1;
  votes.forEach((v, hero) => {
    const score = v.n * 10 + v.rank;
    if (score > bestScore){ bestScore = score; best = hero; }
  });
  const v = votes.get(best);
  /* 英雄名宁缺毋滥：单个版本的“精确命中”也可能是把立绘小字认成了另一个英雄，
     至少要有两个版本相互印证才自动填。 */
  return (v && (v.n >= 2 || (v.rank === 3 && best.length === 1))) ? best : "";
}

/**
 * 五行行位拟合：客户端页的行是等距的，拿候选 y（昵称 / 数字 / 百分数都行）
 * 试「首行 + 行距」组合，命中最多的那一组即行网格。这样表头、徽章、装备行
 * 这些干扰候选不会把行带偏。
 */
function clientRowGrid(cands, H, stats){
  const ys = cands.filter(y => y > H*CLI.rowLo && y < H*CLI.rowHi).sort((a,b) => a-b);
  if (ys.length < 3) return [];
  const pitchLo = 0.100;
  const pitchHi = 0.145;
  let best = null;
  ys.forEach(y0 => {
    for (let pitch = pitchLo; pitch <= pitchHi; pitch += 0.0008){
      const p = pitch*H;
      let hit = 0, err = 0;
      for (let i=0;i<5;i++){
        const y = y0 + i*p;
        let d = Infinity;
        ys.forEach(v => { const dd = Math.abs(v - y); if (dd < d) d = dd; });
        if (d < H*0.020){ hit++; err += d; }
      }
      if (!best || hit > best.hit || (hit === best.hit && err < best.err)) best = { y0, hit, err };
    }
  });
  if (!best || best.hit < 4) return [];
  /* 行距：在命中最多的那一档里取最小误差的 */
  let pitch = 0, bestErr = Infinity;
  for (let p2 = pitchLo; p2 <= pitchHi; p2 += 0.0008){
    let err = 0;
    for (let i=0;i<5;i++){
      const y = best.y0 + i*p2*H;
      let d = Infinity;
      ys.forEach(v => { const dd = Math.abs(v - y); if (dd < d) d = dd; });
      err += d;
    }
    if (err < bestErr){ bestErr = err; pitch = p2; }
  }
  /* 再让每一行吸附到最近的候选点：拟合出来的相位常有十几像素的漂移，
     不吸附的话第一行的「数值行」会被裁掉一半。 */
  return Array.from({ length:5 }, (_, i) => {
    const y = best.y0 + i*pitch*H;
    let near = y, d0 = H*0.020;
    ys.forEach(v => { const d = Math.abs(v - y); if (d < d0){ d0 = d; near = v; } });
    return near;
  });
}

/**
 * 把若干裁块拼到一张白底画布上，一次 OCR 认完，再按坐标把结果分回各自的格子。
 * cells: [{ side, i, x0, y0, x1, y1 }]（源图坐标）
 */
async function cliOcrCells(worker, up, cells, scale, opts, colsIn){
  const k = scale || 3, GAP = 18;
  /* 默认两列排开：拼版太窄太高时 tesseract 反而整盘放弃，两列是实测最稳的排法 */
  const cols = colsIn || 2;
  const minX = Math.min(...cells.map(c => c.x0)), minY = Math.min(...cells.map(c => c.y0));
  const CW = Math.max(...cells.map(c => c.x1 - c.x0)), CH = Math.max(...cells.map(c => c.y1 - c.y0));
  const rows = Math.ceil(cells.length / cols);
  const c = document.createElement("canvas");
  c.width = cols*CW*k + GAP*(cols+1);
  c.height = rows*CH*k + GAP*(rows+1);
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const placed = cells.map((cell, idx) => {
    const col = idx % cols, row = Math.floor(idx / cols);
    const dx = GAP + col*(CW*k + GAP), dy = GAP + row*(CH*k + GAP);
    const sw = cell.x1 - cell.x0, sh = cell.y1 - cell.y0;
    /* 小块居中放到自己的格子里（白底留边，tesseract 才好切块） */
    const tw = Math.round(sw*k), th = Math.round(sh*k);
    const tx = dx + Math.round((CW*k - tw)/2), ty = dy + Math.round((CH*k - th)/2);
    ctx.drawImage(up, cell.x0, cell.y0, sw, sh, tx, ty, tw, th);
    /* bin: 立绘上的白字 —— 按亮度二值化（亮像素留黑、其余刷白），否则 tesseract 会被花纹带跑。
       bin:"sat" 只留「低饱和 + 够亮」的像素：白字是灰白的，立绘的亮部一般是彩色的，这样更干净。 */
    if (cell.bin){
      const im = ctx.getImageData(tx, ty, tw, th), dd = im.data;
      const satMode = cell.bin === "sat";
      for (let i=0;i<dd.length;i+=4){
        const r = dd[i], g = dd[i+1], b = dd[i+2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const isText = satMode ? ((mx - mn) < 45 && mn > 140) : (mn > 165);
        const v = isText ? 0 : 255;
        dd[i] = dd[i+1] = dd[i+2] = v;
      }
      ctx.putImageData(im, tx, ty);
    }
    return { cell, x0:dx, y0:dy, x1:dx + CW*k, y1:dy + CH*k };
  });
  let data;
  try { data = (await worker.recognize(c, opts || {}, { text:true, tsv:true })).data; }
  catch(e){ return { texts: cells.map(() => ""), tokens: cells.map(() => []), confidences: cells.map(() => 0), montage: c.toDataURL("image/png") }; }
  const texts = cells.map(() => "");
  const tokens = cells.map(() => []);
  const confs = cells.map(() => []);
  wordsFromTSV(data.tsv).forEach(w => {
    const hit = placed.find(p => w.cx >= p.x0 && w.cx < p.x1 && w.cy >= p.y0 && w.cy < p.y1);
    if (!hit) return;
    const idx = placed.indexOf(hit);
    texts[idx] = (texts[idx] ? texts[idx] + " " : "") + w.text;
    tokens[idx].push({ t: w.text, x: (w.cx - hit.x0) / (hit.x1 - hit.x0) });
    if (Number.isFinite(+w.conf)) confs[idx].push(+w.conf);
  });
  /* 拼版画布留着，方便排查「到底给 tesseract 看了什么样」 */
  return {
    texts, tokens, montage: c.toDataURL("image/png"),
    confidences: confs.map(a => a.length ? Math.round(a.reduce((t, n) => t + n, 0) / a.length) : 0),
  };
}

/**
 * 同一张裁块用三种预处理各认一遍：
 *   raw   原图，保留游戏原本的抗锯齿；
 *   gray  灰度 + 分位拉伸，适合浅色字压在渐变底上；
 *   light 低饱和亮字掩膜，专门把白字抽成黑字白底。
 * 三份结果不直接合并文本，而是交给候选投票，避免某个版本把一整格带偏。
 */
function makeOcrVariant(source, variant){
  if (!variant || variant === "raw") return source;
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  ctx.drawImage(source, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
  if (variant === "light"){
    for (let i=0;i<d.length;i+=4){
      const r=d[i], g=d[i+1], b=d[i+2];
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
      const whiteText = mn > 128 && (mx-mn) < 62;
      const v = whiteText ? 0 : 255;
      d[i]=d[i+1]=d[i+2]=v;
    }
  } else {
    const lum = new Uint8Array(d.length/4);
    for (let p=0,j=0;p<d.length;p+=4,j++) lum[j] = (d[p]*299 + d[p+1]*587 + d[p+2]*114)/1000;
    const hist = new Uint32Array(256);
    for (let j=0;j<lum.length;j++) hist[lum[j]]++;
    const step = Math.max(1, Math.floor(lum.length/20000));
    const sample = [];
    for (let j=0;j<lum.length;j+=step) sample.push(lum[j]);
    sample.sort((a,b)=>a-b);
    const lo = sample[Math.floor(sample.length*0.03)] || 0;
    const hi = sample[Math.floor(sample.length*0.97)] || 255;
    const span = Math.max(1, hi-lo);
    for (let p=0,j=0;p<d.length;p+=4,j++){
      const v = Math.max(0, Math.min(255, Math.round((lum[j]-lo)*255/span)));
      d[p]=d[p+1]=d[p+2]=v;
    }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/**
 * 客户端战绩页 → 每侧 5 行。
 * 数字都压在图标 / 半透明条上，整页 OCR 会漏，所以按「行网格」逐块裁出来再认一遍：
 *   hero 格 = 立绘左下角的英雄名小字
 *   num 格  = 装备页的 KDA + 总经济（同一行文字）
 *   stat 格 = 数据页的输出 / 承受 / 总经济 / 参团率 + 各自占比
 * 返回 { type, rows:{our,opp}, heroes:{our,opp}, duration }；不是这种页面返回 null。
 */
async function parseClientPage(worker, up, words, rows, page){
  if (!looksLikeClient(words, page)) return null;
  const W = page.w, H = page.h;
  const stats = clientIsStats(words);
  const out = { type: stats ? "stats" : "gear", rows:{ our:[], opp:[] }, conf:{ our:[], opp:[] },
                heroes:{ our:["","","","",""], opp:["","","","",""] },
                heroRaw:{ our:["","","","",""], opp:["","","","",""] }, duration:"" };
  const allText = words.map(w => w.text).join(" ");
  const dt = allText.match(/(\d{1,2})[:：](\d{2})/);
  if (dt) out.duration = dt[1] + ":" + dt[2];

  /* 1) 行网格：装备页拿 KDA 数字当锚（和昵称同一行），数据页拿占比条里的百分数当锚。
        两处都只用「同一种候选」，混着用会把网格拟合到错误的行上。 */
  const grid = { our:[], opp:[] };
  ["our", "opp"].forEach(side => {
    const ys = [];
    words.forEach(w => {
      if (!cliInCol(w, stats ? CLI.stat[side] : CLI.kda[side], W)) return;
      if (stats){
        if (cliPct(w.text) !== null) ys.push(w.cy);
      } else if (/^\d{1,2}$/.test(cliClean(w.text)) || kdaToken(w.text)){
        ys.push(w.cy);
      }
    });
    grid[side] = clientRowGrid(ys, H, stats);
  });
  /* 左右两半的行是同一条网格：一侧的锚不够用，直接借另一侧的（实测两边的行高完全一致） */
  if (grid.our.length < 4 && grid.opp.length >= 4) grid.our = grid.opp.slice();
  if (grid.opp.length < 4 && grid.our.length >= 4) grid.opp = grid.our.slice();
  if (grid.our.length < 4 && grid.opp.length < 4){
    clientDebug = (clientDebug || []).concat([{ type:"fail-grid", stats, grid }]);
    return null;
  }
  /* 数据页的行锚是「占比」那一行，往上挪半格才是这一行的文字行 */
  const textY = side => grid[side].map(y => y - H*(stats ? CLI.statDy : CLI.kdaDy));

  /* 2) 表格结构：每个数值字段单独裁一格。数据页按四列拆，装备页按 KDA/经济拆，
        不再让同一行里的数字互相串列。 */
  const psm = { tessedit_pageseg_mode: "6" };
  const numPsm = { tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789.%kK/" };
  const namePsm = { tessedit_pageseg_mode: "7" };
  const cells = [], heroCells = [];
  const nameCells = [];
  ["our", "opp"].forEach(side => {
    textY(side).forEach((y, i) => {
      const nr = CLI.nickCrop[side];
      nameCells.push({
        side, i,
        x0:Math.round(nr[0]*W), x1:Math.round(nr[1]*W),
        y0:Math.round(y - H*0.035), y1:Math.round(y + H*0.035),
      });
      const hx = CLI.hero[side];
      ["raw", "bin", "sat"].forEach(v => heroCells.push({
        side, i, variant:v, bin: v === "raw" ? false : v,
        x0:Math.round(hx[0]*W), x1:Math.round(hx[1]*W),
        y0:Math.round(y + H*CLI.heroDy[0]), y1:Math.round(y + H*CLI.heroDy[1]),
      }));
    });
  });

  /* 多版本识别：同一批格子分别喂原图、灰度拉伸、白字掩膜。 */
  const variants = ["raw", "gray", "light"];
  const passes = {};
  const cellOcr = [];
  for (const variant of variants){
    const src = makeOcrVariant(up, variant);
    const data = (await worker.recognize(src, {}, { text:true, tsv:true })).data;
    passes[variant] = wordsFromTSV(data.tsv);
  }
  const heroMont = await cliOcrCells(worker, up, heroCells, 3, psm);
  const nameOcr = nameCells.map(() => ({}));
  for (let idx = 0; idx < nameCells.length; idx++){
    for (const variant of ["raw", "light"]){
      const res = await cliOcrCells(worker, makeOcrVariant(up, variant), [nameCells[idx]], 4, namePsm, 1);
      nameOcr[idx][variant] = { text:res.texts[0] || "", conf:res.confidences[0] || 0 };
    }
    if (!nameOcr[idx].raw.text && !nameOcr[idx].light.text){
      const res = await cliOcrCells(worker, makeOcrVariant(up, "gray"), [nameCells[idx]], 4, namePsm, 1);
      nameOcr[idx].gray = { text:res.texts[0] || "", conf:res.confidences[0] || 0 };
    }
  }
  clientDebug = (clientDebug || []).concat([{ type: out.type, grid, stats,
    cells, variants,
    texts: Object.fromEntries(variants.map(v => [v, cellOcr.map(o => o[v] ? o[v].text : "")])),
    confidences: Object.fromEntries(variants.map(v => [v, cellOcr.map(o => o[v] ? o[v].conf : 0)])),
    heroCells, heroTexts: heroMont.texts, nameCells, nameTexts: nameOcr.map(o => o),
    heroMontage: heroMont.montage }]);

  /* 3) 解析：数据页按字段裁块投票；装备页直接用整页词坐标取 KDA / 经济，
        这样不会因为拼版列数变化把左侧整列漏掉。 */
  const OCRT = window.PKCOCR;
  ["our", "opp"].forEach(side => {
    out.rows[side] = [];
    out.conf[side] = [];
    out.heroes[side] = ["", "", "", "", ""];
  });
  ["our","opp"].forEach(side => {
    textY(side).forEach((cy, i) => {
      const rec = out.rows[side][i] = out.rows[side][i] || {};
      out.conf[side][i] = out.conf[side][i] || {};
      if (stats){
        const specs = [
          ["dmgRaw", "dmgPct", 0],
          ["tankRaw", "tankPct", 1],
          ["goldRaw", "goldShare", 2],
          [null, "kp", 3],
        ];
        specs.forEach(([rawKey, pctKey, fi]) => {
          const range = CLI.statCrop[side][fi];
          const kilos = [], pcts = [];
          variants.forEach(variant => {
            const ws = (passes[variant] || []).filter(w =>
              Math.abs(w.cy - cy) < H*0.052 &&
              w.cx >= range[0]*W && w.cx <= range[1]*W);
            const text = ws.map(w => cliClean(w.text)).join(" ");
            const conf = ws.length ? Math.round(ws.reduce((t,w)=>t+(Number(w.conf)||0),0)/ws.length) : 0;
            const kv = OCRT && OCRT.parseKilo ? OCRT.parseKilo(text) : null;
            const pv = OCRT && OCRT.parsePct ? OCRT.parsePct(text) : null;
            if (kv !== null) kilos.push({ value:kv, conf, variant });
            if (pv !== null) pcts.push({ value:pv, conf, variant });
          });
          const vote = list => OCRT && OCRT.voteCandidates
            ? OCRT.voteCandidates(list, list === kilos ? "kilo" : "pct") : null;
          const k = vote(kilos), p = vote(pcts);
          if (rawKey && k){ rec[rawKey] = k.value; out.conf[side][i][rawKey] = k.conf; }
          if (p){ rec[pctKey] = p.value; out.conf[side][i][pctKey] = p.conf; }
        });
      } else {
        const kdaCands = [], goldCands = [];
        ["raw","gray","light"].forEach(variant => {
          const band = (passes[variant] || [])
            .filter(w => Math.abs(w.cy - cy) < H*0.030)
            .sort((a,b) => a.x - b.x);
          const kdaWords = band.filter(w => cliInCol(w, CLI.kda[side], W));
          const joined = kdaWords.map(w => cliClean(w.text)).join("");
          const m = joined.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})/);
          const kda = OCRT && OCRT.parseKda ? OCRT.parseKda(m ? m[0] : joined) : null;
          if (kda){
            kdaCands.push({ value:kda, conf:Math.round(kdaWords.reduce((t,w)=>t+(Number(w.conf)||0),0)/Math.max(1,kdaWords.length)), variant });
          }
          const goldWords = band.filter(w => cliInCol(w, CLI.numCols[side].gold, W));
          const goldWord = goldWords.map(w => ({ w, v:OCRT && OCRT.parseGold ? OCRT.parseGold(w.text) : null }))
            .filter(o => o.v !== null).sort((a,b) => b.w.conf - a.w.conf)[0];
          if (goldWord){
            goldCands.push({ value:goldWord.v, conf:Number(goldWord.w.conf)||0, variant });
          }
        });
        const kda = OCRT && OCRT.voteCandidates ? OCRT.voteCandidates(kdaCands, "kda") : null;
        const gold = OCRT && OCRT.voteCandidates ? OCRT.voteCandidates(goldCands, "gold") : null;
        if (kda && Array.isArray(kda.value)){
          rec.k = kda.value[0]; rec.d = kda.value[1]; rec.a = kda.value[2];
        }
        if (gold) rec.gold = String(gold.value);
        out.conf[side][i].kda = kda ? kda.conf : 0;
        out.conf[side][i].gold = gold ? gold.conf : 0;
      }
    });
  });
  heroCells.forEach((cell, idx) => {
    const i = cell.i, side = cell.side;
    const t = (heroMont.texts[idx] || "").trim();
    if (t) out.heroRaw[side][i] = (out.heroRaw[side][i] ? out.heroRaw[side][i] + " | " : "") + t;
    const hero = pickHeroCandidate([t]);
    if (hero && !out.heroes[side][i]) out.heroes[side][i] = hero;
  });
  /* 4) 昵称单独裁一条窄格 OCR：整页 OCR 会把昵称拆成单字、丢掉英文 ID 的符号。 */
  nameCells.forEach((cell, idx) => {
    const rec = out.rows[cell.side] && out.rows[cell.side][cell.i];
    if (!rec) return;
    const extracted = ["raw", "light", "gray"].map(variant => {
      const t = nameOcr[idx] && nameOcr[idx][variant] ? nameOcr[idx][variant].text : "";
      const compact = String(t).replace(/\s+/g, "");
      const cn = (compact.match(/[\u4e00-\u9fa5]{2,14}/) || [""])[0];
      const latin = (compact.match(/[A-Za-z][A-Za-z0-9_.^\-]{1,24}/) || [""])[0];
      let name = (cn || latin).replace(/\s+/g, "");
      if (name && compact.includes("_") && name.endsWith("_") === false) name += "_";
      if (name && /[。.]$/.test(compact) && !/[。.]$/.test(name)) name += compact.match(/[。.]$/)[0];
      return name;
    }).filter(Boolean);
    /* 整页 OCR 对长中文 ID 往往比碎裁块更完整，作为额外候选一起投票。 */
    const fullBand = words.filter(w =>
      Math.abs(w.cy - (textY(cell.side)[cell.i] || 0)) < H*0.040 &&
      cliInCol(w, CLI.nick[cell.side], W) && !isNoiseText(w.text));
    const full = joinName(fullBand, cell.side, W/2, null);
    if (full) extracted.push(full.replace(/\s+/g, ""));
    const grouped = new Map();
    extracted.forEach(name => grouped.set(name, (grouped.get(name) || 0) + 1));
    const candidates = [...grouped.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count || b.name.length - a.name.length);
    const existing = S.game.rows[cell.i] && S.game.rows[cell.i][cell.side]
      ? S.game.rows[cell.i][cell.side].name : "";
    const best = candidates[0];
    /* 已有名字优先保留（尤其是人工确认过或上一轮已校正的值）；空白时才自动填。 */
    const sameAsExisting = candidates.find(c => c.name === existing);
    if (existing && sameAsExisting) rec.name = existing;
    else if (!existing && best) rec.name = best.name.slice(0, 20);
  });
  /* 认得太少就当不是这种页面，交给下面的兜底路径 */
  const heroHit = out.heroes.our.filter(Boolean).length + out.heroes.opp.filter(Boolean).length;
  const filled = ["our", "opp"].reduce((t, s) => t + out.rows[s]
    .filter(r => r && (r.k !== undefined || r.gold || r.dmgRaw !== undefined ||
      r.tankRaw !== undefined || r.dmgPct !== undefined || r.goldShare !== undefined)).length, 0);
  out.heroHit = heroHit;
  /* 英雄名只是可选的展示字段，绝不参与“这是不是数据页”的判断。 */
  if (filled < 3){
    clientDebug = (clientDebug || []).concat([{ type:"fail-thin", stats, grid,
      texts: Object.fromEntries(variants.map(v => [v, cellOcr.map(o => o[v] ? o[v].text : "")])),
      heroTexts: heroMont.texts }]);
    return null;
  }
  return out;
}

/** 客户端截图没有队名：拿识别到的昵称去队伍库里比，命中多的那两支当蓝方 / 红方 */
function matchTeamsByName(names){
  const s = S.series;
  const norm = x => normPlayerName(x);
  const hit = (team, list) => {
    const roster = ((team && team.players) || []).map(norm).filter(Boolean);
    let n = 0;
    list.forEach(x => {
      const k = norm(x);
      if (!k) return;
      if (roster.some(r => r === k || (r.length >= 2 && k.length >= 2 && (r.includes(k) || k.includes(r))))) n++;
    });
    return n;
  };
  const scored = s.teams.map(t => ({ t, n: hit(t, names) })).sort((a,b) => b.n - a.n);
  return { best: scored[0] || null, second: scored[1] || null };
}
async function runOCR(files){
  clientDebug = null;
  const box = $("#ocrBox"); box.style.display = "block";
  ocrMsg("正在加载识别引擎…"); ocrPct(0);
  let worker;
  try { worker = await ocrWorkerGet(); }
  catch(e){ ocrMsg("识别不可用：" + e.message); return; }
  /** 手机截图字号小，先放大再识别，准确率明显更高 */
  const prep = async (file) => {
    try {
      const bmp = await createImageBitmap(file);
      const scale = bmp.width < 900 ? 3 : (bmp.width < 1600 ? 2 : 1.5);
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width*scale);
      c.height = Math.round(bmp.height*scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      return c;
    } catch(e){ return file; }
  };
  const allLines = [], raws = [], sbBlocks = [], cliPages = [];
  const dbgFiles = [];
  let sbDuration = "";
  let sbHeader = null;
  for (let i=0;i<files.length;i++){
    const f = files[i];
    ocrMsg("识别第 " + (i+1) + "/" + files.length + " 张：" + f.name);
    const up = await prep(f);
    let data;
    try { data = (await worker.recognize(up, {}, { text: true, tsv: true })).data; }
    catch(e){ ocrMsg("识别失败：" + e.message); continue; }
    raws.push("【" + f.name + "】\n" + (data.text||"").trim());
    const page = pageSizeFromTSV(data.tsv);
    const words = wordsFromTSV(data.tsv);
    if (!words.length) continue;
    page.w = Math.max(page.w, ...words.map(w => w.x + w.w));
    page.h = Math.max(page.h, ...words.map(w => w.y + w.h));
    const rows = clusterRows(words);
    dbgFiles.push({
      name: f.name, page: { w: page.w, h: page.h },
      words: words.map(w => ({ t: w.text, x: Math.round(w.x), y: Math.round(w.y), c: Math.round(w.conf || 0) })),
      rows: rows.map(r => ({ cy: Math.round(r.cy), t: r.words.map(w => w.text).join("") })),
    });
    const isCli = looksLikeClient(words, page);
    // 顶部：双方队名 / 比分 / 获胜方 / 时长
    if (!sbHeader || (!sbHeader.blueName && !sbHeader.redName)){
      const h = parseSaibaoHeader(rows, page);
      /* 客户端截图里没有队名，顶上那些「创建房间 / 更多」是界面字样，
         只取时长，别把界面文字当成队名建进队伍库。 */
      if (isCli){
        if (h.duration && !sbDuration) sbDuration = h.duration;
      } else if (h.blueName || h.redName || h.blueScore || h.redScore){
        sbHeader = h;
        sbHeader.applied = applySaibaoHeader(h);
      }
    }
    /* 一、王者荣耀客户端「战绩」页（装备页 / 数据页）——版式与赛宝完全不同，优先按它解析 */
    if (isCli){
      let cli = null;
      try { cli = await parseClientPage(worker, up, words, rows, page); }
      catch(err){
        clientDebug = (clientDebug || []).concat([{ type:"fail-throw", message:String((err && err.message) || err) }]);
      }
      if (cli){
        if (cli.duration && !sbDuration) sbDuration = cli.duration;
        cliPages.push(cli);
        continue;
      }
    }
    // 二、赛宝「数据」页版式（选手行 + 4 条百分比行）
    const sb = parseSaibaoBlocks(rows, page);
    if (sb.blocks.length >= 3){
      /* 不再用英雄头像特征反推英雄或数据；英雄展示名留空，由选手名/英雄下拉补。
         这样版式变化或新英雄加入时，数据识别不会被头像库拖住。 */
      sb.blocks.forEach(b => sbBlocks.push(b));
      if (!sbDuration && sb.duration) sbDuration = sb.duration;
      continue;
    }
    // 兜底：通用表格（左右两栏或上下两段）
    const lanes = splitLanes(words, page.w);
    const push = (r, side) => {
      const txt = r.words.map(w => w.text).join("");
      const s = /对方|敌方|红色方/.test(txt) ? "opp" : (/我方|蓝色方/.test(txt) ? "our" : side);
      const line = rowToLine(r, s);
      if (line) allLines.push(line);
    };
    if (lanes){
      clusterRows(lanes.left).forEach(r => push(r, "our"));
      clusterRows(lanes.right).forEach(r => push(r, "opp"));
    } else {
      const sideFn = guessSides(rows, page.w);
      rows.forEach(r => push(r, sideFn ? sideFn(r) : "our"));
    }
  }
  ocrMsg("识别完成，正在填入表格…"); ocrPct(1);
  let n = 0, mode = "";
  let cliNote = "";
  let cliHeroOf = null, cliHeroRawOf = null;
  let cliMerge = null;
  if (cliPages.length){
    mode = "client";
    if (sbDuration){ S.game.duration = sbDuration; $("#inDur").value = sbDuration; }
    const gear  = cliPages.find(p => p.type === "gear")  || null;
    const stats = cliPages.find(p => p.type === "stats") || null;
    cliMerge = window.PKCOCR && window.PKCOCR.mergeClientPages
      ? window.PKCOCR.mergeClientPages(cliPages, {})
      : null;
    if (cliMerge){
      /* KDA 合计是截图里最可靠的一组冗余数据：用它校正旧的/空的比分。 */
      if (cliMerge.inferredScores && cliMerge.inferredScores.our) S.game.ourScore = cliMerge.inferredScores.our;
      if (cliMerge.inferredScores && cliMerge.inferredScores.opp) S.game.oppScore = cliMerge.inferredScores.opp;
    }
    /* 英雄名是按行网格逐格认的，直接跟行号对齐；两张截图各自的「原图 / 二值化」
       两个版本一起投票，命中率比只看一版高不少。 */
    const heroOf = { our:["","","","",""], opp:["","","","",""] };
    const heroRawOf = { our:["","","","",""], opp:["","","","",""] };
    ["our", "opp"].forEach(side => {
      for (let i=0;i<5;i++){
        const cands = [];
        cliPages.forEach(p => {
          const raw = (p.heroRaw && p.heroRaw[side] && p.heroRaw[side][i]) || "";
          raw.split("|").map(x => x.trim()).filter(Boolean).forEach(x => cands.push(x));
        });
        heroOf[side][i] = pickHeroCandidate(cands) || "";
        heroRawOf[side][i] = cands.join(" | ");
      }
    });
    cliHeroOf = heroOf; cliHeroRawOf = heroRawOf;
    for (let i=0;i<5;i++){
      const row = S.game.rows[Math.min(i, S.game.rows.length-1)];
      ["our", "opp"].forEach(side => {
        const p = side === "our" ? row.our : row.opp;
        const g  = gear  ? (gear.rows[side][i]  || null) : null;
        const st = stats ? (stats.rows[side][i] || null) : null;
        const m = cliMerge ? (cliMerge.rows[side][i] || null) : null;
        if (m){
          ["k","d","a"].forEach(key => { if (m[key] !== undefined) p[key] = String(m[key]); });
          if (m.gold) p.gold = m.gold;
          if (m.name) p.name = m.name;
          const has = v => v !== undefined && v !== null;
          p.dmgWan    = has(m.dmgRaw)   ? fmtWan(m.dmgRaw/10000) : "";
          p.dmgPct    = has(m.dmgPct)   ? String(m.dmgPct)   : "";
          p.tankPct   = has(m.tankPct)  ? String(m.tankPct)  : "";
          p.goldShare = has(m.goldShare)? String(m.goldShare) : "";
          p.kp        = has(m.kp)       ? String(m.kp)      : "";
        } else {
          if (g){
            ["k","d","a"].forEach(key => { if (g[key] !== undefined) p[key] = String(g[key]); });
            if (g.gold) p.gold = g.gold;
            if (g.name) p.name = g.name;
          }
          if (st){
            if (st.goldRaw && !p.gold) p.gold = String(st.goldRaw);
            const has = v => v !== undefined && v !== null;
            p.dmgWan    = has(st.dmgRaw)   ? fmtWan(st.dmgRaw/10000) : "";
            p.dmgPct    = has(st.dmgPct)   ? String(st.dmgPct)   : "";
            p.tankPct   = has(st.tankPct)  ? String(st.tankPct)  : "";
            p.goldShare = has(st.goldShare)? String(st.goldShare) : "";
            p.kp        = has(st.kp)       ? String(st.kp)      : "";
          }
        }
        if (heroOf[side][i]) p.hero = heroOf[side][i];
        p.gpm = "";                       // 让「总经济 ÷ 时长」自动推算分均经济
      });
      n++;
    }
    /* 客户端截图没有队名：拿昵称去队伍库里比，命中多的那两支当蓝方 / 红方 */
    const namesOf = side => S.game.rows.map(r => (side === "our" ? r.our : r.opp).name).filter(Boolean);
    const ourNames = namesOf("our"), oppNames = namesOf("opp");
    let blueT = null, redT = null;
    if (ourNames.length + oppNames.length >= 3){
      const pickBest = (list, avoidId) => {
        const cand = matchTeamsByName(list);
        const arr = [cand.best, cand.second].filter(x => x && x.n >= 2 && x.t.id !== avoidId);
        return arr[0] || null;
      };
      blueT = pickBest(ourNames, null);
      redT  = pickBest(oppNames, blueT ? blueT.t.id : null);
      if (blueT) S.game.ourId = blueT.t.id;
      if (redT)  S.game.oppId  = redT.t.id;
    }
    const pages = [];
    if (gear)  pages.push("装备页");
    if (stats) pages.push("数据页");
    cliNote = "按<b>王者荣耀客户端「战绩」页</b>识别（" + pages.join(" + ") + "）"
      + (cliMerge && cliMerge.inferredScores && cliMerge.inferredScores.our !== undefined
          ? "，按五名选手击杀合计校正比分 <b>" + esc(cliMerge.inferredScores.our) + " : " + esc(cliMerge.inferredScores.opp) + "</b>"
          : "")
      + (blueT || redT ? "，并按选手昵称认出队伍：<b>蓝方 " + esc(blueT ? blueT.t.name : "—")
          + " / 红方 " + esc(redT ? redT.t.name : "—") + "</b>" : "")
      + "。";
  } else if (sbBlocks.length >= 3){
    mode = "saibao";
    if (sbDuration){ S.game.duration = sbDuration; $("#inDur").value = sbDuration; }
    const KEYS = ["k","d","a","gold","dmgPct","tankPct","goldShare","kp"];
    sbBlocks.slice(0,5).forEach((b, i) => {
      const row = S.game.rows[Math.min(i, S.game.rows.length-1)];
      KEYS.forEach(k => {
        if (b.our[k] !== undefined) row.our[k] = String(b.our[k]);
        if (b.opp[k] !== undefined) row.opp[k] = String(b.opp[k]);
      });
      if (b.our.hero) row.our.hero = b.our.hero;      // 图标比对出的英雄
      if (b.opp.hero) row.opp.hero = b.opp.hero;
      if (b.our.name) row.our.name = b.our.name;
      if (b.opp.name) row.opp.name = b.opp.name;
      row.our.gpm = ""; row.opp.gpm = "";      // 让「总经济 ÷ 时长」自动推算分均经济
      n++;
    });
  } else {
    mode = "table";
    const txt = allLines.join("\n");
    $("#pasteBox").value = txt;
    n = parseLines(txt);
  }
  // 名字对名单 → 统一写法 + 自动填分路（名额不限制，随时能在「位置」列手动改）
  const mOur = autoMatchPlayers("our"), mOpp = autoMatchPlayers("opp");
  const hOur = autoMatchHeroLanes("our", true), hOpp = autoMatchHeroLanes("opp", true);
  const laneMsg = (mOur.laned + mOpp.laned + hOur.laned + hOpp.laned)
    ? ("，其中 " + (mOur.laned + mOpp.laned + hOur.laned + hOpp.laned) + " 人自动填了分路") : "";
  renderTables(); renderPreview(); scheduleSave();
  renderGameForm(); renderTeamGrid();
  $("#ocrReview").style.display = "block";
  const heroWord = mode === "client" ? "立绘左下角的小字（逐行裁块 + 多版本投票认的，认不全很正常，请核对）"
                                     : "官方头像比对";
  $("#ocrReview").innerHTML = (mode === "client" ? clientReview(cliPages, cliNote, cliHeroOf, cliHeroRawOf, cliMerge) :
      (mode === "saibao" ? saibaoReview(sbBlocks, sbDuration) :
      ('<div class="notice '+(n?"ok":"warn")+'">识别到 '+n+' 条选手数据，已填入下方表格。</div>')))
    + (sbHeader && (sbHeader.blueName || sbHeader.redName) ? headerReview(sbHeader) : "")
    + ((mOur.matched + mOpp.matched) ? ('<div class="hint" style="margin-top:6px">有 ' + (mOur.matched + mOpp.matched) + ' 个选手名在队伍名单里对上了，已统一成名单里的写法' + laneMsg + '。</div>') : "")
    + '<div class="notice info" style="margin-top:8px">OCR 对数字有误读概率（0/8、1/7、5/6），<b>出图前请核对一遍</b>；'
    + '英雄名是用<b>' + heroWord + '</b>认出来的，没把握的会留空、需要你手填；选手名同理。'
    + '　<b>识别出来的每一项都能改</b>：队名直接在上面两个输入框里改，选手名在「选手」列选「✎ 手动输入 / 改名字…」，比分/时长/数字直接在格子里改。'
    + '&nbsp;<button class="mini" id="btnSwapSide">蓝方 ⇄ 红方 互换</button></div>'
    + '<details style="margin-top:8px"><summary>查看识别原文（'+files.length+' 张）</summary><pre class="ocr">'
    + esc(raws.join("\n\n")) + '</pre></details>';
  const sw = $("#btnSwapSide");
  if (sw) sw.onclick = swapSides;
  ocrDebug = { mode, files: dbgFiles, sbBlocks, cliPages, merge: cliMerge };
  toast(n ? ("识别完成，填入 " + n + " 组对位数据") : "识别完成，但没解析出结构化数据");
}

/* ---------- DeepSeek AI 识别：截图直读结构化 JSON ---------- */
function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("读取图片失败"));
    fr.readAsDataURL(file);
  });
}

function applyAIResult(data, files){
  const blue = Array.isArray(data && data.blue) ? data.blue : [];
  const red = Array.isArray(data && data.red) ? data.red : [];
  const numStr = v => v === null || v === undefined || v === "" ? "" : String(v);
  for (let i=0;i<5;i++){
    const row = S.game.rows[Math.min(i, S.game.rows.length-1)];
    [["our", blue[i]], ["opp", red[i]]].forEach(([side, src]) => {
      if (!src) return;
      const p = row[side];
      ["k","d","a","dmgPct","tankPct","goldShare","kp"].forEach(k => {
        if (src[k] !== null && src[k] !== undefined) p[k] = numStr(src[k]);
      });
      if (src.gold !== null && src.gold !== undefined) p.gold = numStr(src.gold);
      if (src.dmgRaw !== null && src.dmgRaw !== undefined) p.dmgWan = fmtWan(src.dmgRaw/10000);
      if (src.name) p.name = String(src.name).replace(/\s+/g, "");
      if (src.hero) p.hero = String(src.hero);
      p.gpm = "";
      p.dmgPerGold = "";
    });
  }
  const sumK = side => S.game.rows.reduce((t, r) => t + (parseNum(r[side].k) || 0), 0);
  const blueKills = sumK("our"), redKills = sumK("opp");
  S.game.ourScore = String(blueKills);
  S.game.oppScore = String(redKills);
  S.game.result = blueKills >= redKills ? "win" : "lose";
  if (data && data.duration){
    S.game.duration = String(data.duration);
    $("#inDur").value = S.game.duration;
  }
  const namesOf = side => S.game.rows.map(r => r[side].name).filter(Boolean);
  const blueMatch = matchTeamsByName(namesOf("our"));
  const redMatch = matchTeamsByName(namesOf("opp"));
  if (blueMatch.best && blueMatch.best.n >= 2) S.game.ourId = blueMatch.best.t.id;
  if (redMatch.best && redMatch.best.n >= 2) S.game.oppId = redMatch.best.t.id;
  autoMatchPlayers("our"); autoMatchPlayers("opp");
  autoMatchHeroLanes("our", true); autoMatchHeroLanes("opp", true);
  renderGameForm(); renderTables(); renderPreview(); renderTeamGrid(); scheduleSave();
  const reviewRows = S.game.rows.map((r,i) =>
    '<tr><td class="pos">'+esc(POSITIONS[i])+'</td><td>'+esc(r.our.name||"—")+' / '+esc(r.our.hero||"—")
    + '<br><span class="hint">KDA '+kdaText(r.our)+' · 经济 '+(r.our.gold||"—")+'</span></td>'
    + '<td>'+esc(r.opp.name||"—")+' / '+esc(r.opp.hero||"—")
    + '<br><span class="hint">KDA '+kdaText(r.opp)+' · 经济 '+(r.opp.gold||"—")+'</span></td></tr>').join("");
  $("#ocrReview").style.display = "block";
  $("#ocrReview").innerHTML = '<div class="notice ok"><b>DeepSeek AI 识别完成</b> · 已读取 '
    + files.length + ' 张截图；比分按 KDA 合计校正为 <b>' + blueKills + ' : ' + redKills
    + '</b>。' + (blueMatch.best && blueMatch.best.n >= 2 ? ' 已按昵称匹配队伍。' : '')
    + '</div><div class="tbl-wrap" style="margin-top:8px"><table class="g"><thead><tr><th>位置</th><th>蓝方</th><th>红方</th></tr></thead><tbody>'
    + reviewRows + '</tbody></table></div>'
    + '<div class="hint" style="margin-top:6px">AI 结果仍建议扫一眼英雄和昵称；不满意的格子可直接在下方表格修改。</div>';
  ocrDebug = { mode:"ai", result:data };
  ocrMsg("AI 识别完成");
  ocrPct(1);
  toast("DeepSeek 识别完成：蓝方 " + blueKills + " / 红方 " + redKills);
}

async function runAIOCR(files){
  if (!files || !files.length){ toast("请先选择截图"); return; }
  const box = $("#ocrBox"); box.style.display = "block";
  ocrMsg("DeepSeek 正在读取截图…");
  ocrPct(.08);
  try {
    const images = await Promise.all(files.slice(0, 4).map(fileToDataURL));
    const res = await fetch("/api/ai-ocr", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ images, hint:"第一张通常是装备页，第二张是数据页；请按画面读取，不要猜测。" }),
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || ("HTTP " + res.status));
    applyAIResult(out.data, files);
  } catch (e) {
    ocrMsg("AI 识别失败：" + e.message);
    ocrPct(0);
    toast("AI 识别失败，改用本地 OCR：" + e.message);
    try { await runOCR(files); } catch (_) { /* local OCR already reports its own error */ }
  }
}
function headerReview(hdr){
  const ap = hdr.applied || {};
  const blue = ap.blue ? ap.blue.name : hdr.blueName;
  const red  = ap.red  ? ap.red.name  : hdr.redName;
  const win  = hdr.blueWin === null ? null : (hdr.blueWin ? "蓝方" : "红方");
  let html = '<div class="notice ok" style="margin-top:8px">识别到对阵：'
    + '<b>蓝方 '+esc(blue||"—")+'</b> ' + esc(hdr.blueScore||"-") + ' : ' + esc(hdr.redScore||"-")
    + ' <b>红方 '+esc(red||"—")+'</b>'
    + (win ? '　→　<b>'+win+'获胜</b>' : "")
    + (hdr.duration ? '　·　时长 '+esc(hdr.duration) : "")
    + '，已自动填到本局信息里。</div>';
  if (ap.added && ap.added.length){
    html += '<div class="notice info" style="margin-top:6px">队伍库里没有这两支队，已自动新建：'
          + esc(ap.added.join("、")) + '（<b>名字识别错就直接在上面「蓝方队伍/红方队伍」输入框里改</b>，颜色和 5 名选手名单在「队伍库」里）</div>';
  }
  return html;
}
/** 客户端战绩页的复核区：把两页识别到的内容按 10 名选手并排列出来 */
function clientReview(pages, note, heroOf, heroRawOf, merge){
  const gear  = pages.find(p => p.type === "gear")  || null;
  const stats = pages.find(p => p.type === "stats") || null;
  const heroN = heroOf ? ["our","opp"].reduce((t, s) => t + heroOf[s].filter(Boolean).length, 0) : 0;
  const cell = (side, i) => {
    const g  = gear  ? (gear.rows[side][i]  || null) : null;
    const st = stats ? (stats.rows[side][i] || null) : null;
    const bits = [];
    if (g){
      bits.push("KDA " + [g.k, g.d, g.a].join("/"));
      bits.push("经济 " + (g.gold || "—"));
      if (g.name) bits.push("昵称 " + g.name);
    }
    if (st){
      if (st.dmgRaw != null)  bits.push("输出 " + fmtWan(st.dmgRaw/10000) + "万");
      if (st.dmgPct != null)  bits.push("输出占比 " + st.dmgPct + "%");
      if (st.tankPct != null) bits.push("承伤占比 " + st.tankPct + "%");
      if (st.goldShare != null) bits.push("经济占比 " + st.goldShare + "%");
      if (st.kp != null)      bits.push("参团 " + st.kp + "%");
    }
    return bits.length ? bits.join("　") : '<span class="hint">—</span>';
  };
  const hero = (side, i) => {
    const h = heroOf && heroOf[side] && heroOf[side][i];
    if (h) return '<img src="/hicon/'+encodeURI(h)+'.jpg" class="hero-img" style="width:24px;height:24px;vertical-align:-6px;margin-right:5px" alt=""><b>'+esc(h)+'</b>';
    const raw = (heroRawOf && heroRawOf[side] && heroRawOf[side][i]) || "";
    return '<span class="hint">英雄待填' + (raw ? '（立绘小字认成「'+esc(raw)+'」）' : '') + '</span>';
  };
  const rows = [];
  for (let i=0;i<5;i++){
    rows.push('<tr><td>'+esc(POSITIONS[i])+'</td>'
      + '<td>'+hero("our", i)+'<div style="font-size:12px;margin-top:2px">'+cell("our", i)+'</div></td>'
      + '<td>'+hero("opp", i)+'<div style="font-size:12px;margin-top:2px">'+cell("opp", i)+'</div></td></tr>');
  }
  const issues = merge && merge.issues ? merge.issues : [];
  const corrections = merge && merge.corrections ? merge.corrections : [];
  const low = [];
  if (merge && merge.conf){
    ["our","opp"].forEach(side => merge.conf[side].forEach((c, i) => {
      Object.keys(c || {}).forEach(field => {
        const conf = Number(c[field]);
        if (conf > 0 && conf < 55) low.push((side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行 " + field + "（" + Math.round(conf) + " 分）");
      });
    }));
  }
  const issueHtml = issues.length
    ? '<div class="notice warn" style="margin-top:8px"><b>语义校验发现 ' + issues.length + ' 处需要核对：</b><br>'
      + issues.slice(0, 8).map(x => "· " + esc(x.message)).join("<br>")
      + (issues.length > 8 ? '<br>· 还有 ' + (issues.length - 8) + ' 处，详见识别调试信息。' : '')
      + '</div>'
    : '<div class="notice ok" style="margin-top:8px">语义校验通过：五名选手的 KDA 合计、各项占比和跨页重复字段没有发现明显冲突。</div>';
  const correctionHtml = corrections.length
    ? '<div class="notice info" style="margin-top:6px"><b>已自动补全 ' + corrections.length + ' 项：</b><br>'
      + corrections.slice(0, 6).map(x => "· " + esc(x.message)).join("<br>")
      + (corrections.length > 6 ? '<br>· 还有 ' + (corrections.length - 6) + ' 项。' : '') + '</div>'
    : '';
  return '<div class="notice ok">'+note
    + (heroN ? '英雄名认到 '+heroN+' 个。' : '英雄名一个都没认出来，请在「英雄」列手填。') + '</div>'
    + issueHtml
    + correctionHtml
    + (low.length ? '<div class="hint" style="margin-top:6px">低置信度格子：' + esc(low.slice(0, 10).join("；")) + (low.length > 10 ? '…' : '') + '</div>' : '')
    + '<div class="tbl-wrap" style="margin-top:8px"><table class="g"><thead><tr><th>顺序</th><th>蓝方</th><th>红方</th></tr></thead><tbody>'
    + rows.join("") + '</tbody></table></div>'
    + '<div class="hint" style="margin-top:6px">客户端截图<b>没有队名和比分</b>：队名靠昵称在「队伍库」里认（认错了直接在上面两个输入框改），'
    + '比分与胜负请在「本局信息」里填。装备页给 KDA / 总经济，数据页给输出、承伤、经济占比、参团率，'
    + '<b>只给其中一张也能识别</b>，缺的那半留空手填即可。</div>';
}
function saibaoReview(blocks, dur){
  const cell = p => [
    "KDA " + ((p.k===undefined?"-":p.k) + "/" + (p.d===undefined?"-":p.d) + "/" + (p.a===undefined?"-":p.a)),
    "经济 " + (p.gold || "—"),
    "输出 " + (p.dmgPct!==undefined ? p.dmgPct+"%" : "—"),
    "承伤 " + (p.tankPct!==undefined ? p.tankPct+"%" : "—"),
    "经济占比 " + (p.goldShare!==undefined ? p.goldShare+"%" : "—"),
    "参团 " + (p.kp!==undefined ? p.kp+"%" : "—")
  ].join(" · ");
  const head = p => p.hero
    ? '<img src="/hicon/'+encodeURI(p.hero)+'.jpg" class="hero-img" style="width:26px;height:26px;vertical-align:-6px;margin-right:5px" alt="">'
      + '<b>'+esc(p.hero)+'</b>' + (p.heroScore ? ' <span class="hint">'+p.heroScore+'</span>' : '')
    : '<span class="hint">英雄未识别</span>';
  const side = p => '<div style="font-size:12px;margin-bottom:2px">'+head(p)+' <span style="margin-left:4px">'+esc(p.name||"（名字待填）")+'</span></div>'
                  + '<span class="hint">'+cell(p)+'</span>';
  const hit = blocks.filter(b => b.our.hero || b.opp.hero).length;
  const rows = blocks.slice(0,5).map((b,i) =>
    '<tr><td class="pos">第'+(i+1)+'行</td><td>'+side(b.our)+'</td><td>'+side(b.opp)+'</td></tr>').join("");
  return '<div class="notice ok">按<b>赛宝「数据」页</b>版式识别到 '+blocks.length+' 组对位数据'
    + (dur ? '（对局时长 '+esc(dur)+'，已用「总经济÷时长」推算分均经济）' : '')
    + (hit ? '，其中 '+hit+' 组通过英雄头像比对出了英雄名' : '')
    + '。<b>分路不会自动猜</b>：识别结果按页面顺序落进 5 行，请在下面对位数据表里给蓝方、红方分别指定分路'
    + '（点「按顺序填分路」可先把 上单→游走 填上，再改错的那几个）。</div>'
    + '<div class="tbl-wrap" style="margin-top:8px"><table class="g"><thead><tr><th>识别顺序</th><th>蓝方</th><th>红方</th></tr></thead><tbody>'
    + rows + '</tbody></table></div>';
}
function swapSides(){
  const g = S.game;
  g.rows.forEach(r => {                       // 连分路一起换，保证对位关系不乱
    const t = r.our; r.our = r.opp; r.opp = t;
    const p = r.pos; r.pos = r.posOpp; r.posOpp = p;
  });
  g.result = g.result === "win" ? "lose" : "win";
  const sc = g.ourScore; g.ourScore = g.oppScore; g.oppScore = sc;
  const id = g.ourId; g.ourId = g.oppId; g.oppId = id;
  renderGameForm(); renderTables(); renderPreview(); renderMgInfo(); renderMatchWarn(); publishContext(0); scheduleSave();
  toast("已互换蓝方/红方");
}

/* ============================================================
   十二、导出
   ============================================================ */
function exportList(allGames){
  const list = [];
  const games = gamesForExport(allGames);
  const [W,H] = targetSize();
  games.forEach(g => {
    const our = S.team(g.ourId), opp = S.team(g.oppId);
    const prefix = sanitizeName([ (our.name||"蓝方")+"_vs_"+(opp.name||"红方"), S.series.name, g.label ].filter(Boolean).join("_"));
    POSITIONS.forEach((pos,i) => list.push({ kind:"card", game:g, idx:i, name:prefix+"_"+pos+".png" }));
    if (DB.prefs.overview) list.push({ kind:"overview", game:g, idx:-1, name:prefix+"_五路总览.png" });
  });
  if (DB.prefs.bracket){
    list.push({ kind:"bk16", name: bkFileName("bk16") });
    list.push({ kind:"bkde", name: bkFileName("bkde") });
  }
  return list;
}
/** 导播台数据图轮播：当前一局的 5 张对位图 + 五路总览，共 6 张。 */
function chartItems(){
  const s = S.series;
  const meta = contextSnapshot() || {};
  const ctx = {
    series: [{
      id: s.id, name: s.name,
      teams: JSON.parse(JSON.stringify(s.teams || [])),
      games: [JSON.parse(JSON.stringify(S.game))],
      current: 0,
    }],
    seriesId: s.id,
    prefs: JSON.parse(JSON.stringify(DB.prefs || {})),
    heroPick: JSON.parse(JSON.stringify(DB.heroPick || {})),
    matchKey: meta.matchKey || "",
    matchLabel: meta.matchLabel || "",
    gameLabel: meta.gameLabel || "",
  };
  const game = JSON.parse(JSON.stringify(S.game));
  const items = POSITIONS.map((pos, i) => ({
    kind: "card", idx: i, game, label: pos + "对位图", ...ctx,
  }));
  items.push({ kind: "overview", idx: -1, game, label: "五路总览", ...ctx });
  return items;
}
function drawExport(item, W, H){
  if (BK_VIEW[item.kind]){                          // 淘汰赛赛程图：按自己的比例出图
    const [bw, bh] = bkExportSize(item.kind, W);
    const c = makeCanvas(bw, bh), ctx2 = c.getContext("2d");
    const sc2 = bw / BK_VIEW[item.kind].w;
    ctx2.setTransform(sc2, 0, 0, sc2, 0, 0);
    drawBk(ctx2, item.kind);
    return c;
  }
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const sc = W/DW;
  ctx.setTransform(sc,0,0,sc,0,0);
  if (item.kind === "card") drawCard(ctx, item.game, item.idx);
  else if (item.kind === "overview") drawOverview(ctx, item.game);
  else drawMulti(ctx);
  return c;
}
function canvasBytes(c){
  return new Promise(res => c.toBlob(b => b.arrayBuffer().then(ab => res(new Uint8Array(ab))), "image/png"));
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function downloadOne(rec, label){
  const [W,H] = targetSize();
  const c = drawExport({ kind:rec.kind, game:S.game, idx:rec.idx }, W, H);
  c.toBlob(b => downloadBlob(b, rec.name || (label + ".png")), "image/png");
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n=0;n<256;n++){ let c = n; for (let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); t[n] = c>>>0; }
  return t;
})();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i=0;i<u8.length;i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c>>>8); return (c ^ 0xFFFFFFFF)>>>0; }
function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const lh = new Uint8Array(30+name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x0800,true);
    lv.setUint16(8,0,true); lv.setUint16(10,0,true); lv.setUint16(12,0x21,true);
    lv.setUint32(14,crc,true); lv.setUint32(18,f.data.length,true); lv.setUint32(22,f.data.length,true);
    lv.setUint16(26,name.length,true); lv.setUint16(28,0,true);
    lh.set(name,30); parts.push(lh, f.data);
    const ch = new Uint8Array(46+name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true); cv.setUint16(10,0,true); cv.setUint16(12,0,true); cv.setUint16(14,0x21,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,f.data.length,true); cv.setUint32(24,f.data.length,true);
    cv.setUint16(28,name.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true);
    cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true);
    ch.set(name,46); central.push(ch);
    offset += lh.length + f.data.length;
  });
  let cdSize = 0; central.forEach(c => cdSize += c.length);
  const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,cdSize,true); ev.setUint32(16,offset,true);
  const all = parts.concat(central, [eocd]);
  let total = 0; all.forEach(p => total += p.length);
  const out = new Uint8Array(total);
  let o = 0; all.forEach(p => { out.set(p,o); o += p.length; });
  return out;
}
async function exportZip(allGames){
  status("正在打包…");
  const [W,H] = targetSize();
  const items = exportList(allGames);
  const files = [];
  for (const it of items){
    const c = drawExport(it, W, H);
    files.push({ name: it.name, data: await canvasBytes(c) });
  }
  if (multiGames().length > 1){
    const c = drawExport({ kind:"multi" }, W, H);
    files.push({ name: sanitizeName(S.series.name) + "_多局对比.png", data: await canvasBytes(c) });
  }
  const zip = makeZip(files);
  downloadBlob(new Blob([zip], { type:"application/zip" }), sanitizeName(S.series.name + "_" + S.game.label) + "_赛后数据图.zip");
  status("已导出 " + files.length + " 张", false);
  toast("已打包 " + files.length + " 张图片");
}
function downloadFixed(allGames){
  const [W,H] = targetSize();
  const items = [];
  const games = gamesForExport(allGames);
  games.forEach((g, gi) => {
    POSITIONS.forEach((p,i) => items.push({ kind:"card", game:g, idx:i, name:"PKC_"+(gi+1)+"_"+p+".png" }));
    if (DB.prefs.overview) items.push({ kind:"overview", game:g, idx:-1, name:"PKC_总览"+(games.length>1?("_"+(gi+1)):"")+".png" });
  });
  if (multiGames().length > 1) items.push({ kind:"multi", game:null, idx:-1, name:"PKC_多局对比.png" });
  if (DB.prefs.bracket){
    items.push({ kind:"bk16", name:"PKC_赛程_16强.png" });
    items.push({ kind:"bkde", name:"PKC_赛程_八强双败.png" });
  }
  items.forEach((it, i) => {
    setTimeout(() => {
      const c = drawExport(it, W, H);
      c.toBlob(b => downloadBlob(b, it.name), "image/png");
    }, i*420);
  });
  status("正在逐个下载 " + items.length + " 张（固定文件名）…");
  toast("浏览器若询问「是否允许下载多个文件」，点允许");
}
function downloadMulti(){
  const [W,H] = targetSize();
  const c = drawExport({ kind:"multi" }, W, H);
  c.toBlob(b => downloadBlob(b, sanitizeName(S.series.name) + "_多局对比.png"), "image/png");
}

/* ============================================================
   十二·B、淘汰赛赛程图（16 强单败淘汰 → 8 强双败淘汰）

   赛制：
   · 预选赛 4 个组（A/B/C/D），每组前 4 名晋级 = 16 强；
   · 16 强赛（第一轮）单败淘汰：每组第 1 名打另一组的第 4 名、第 2 名打另一组的第 3 名
     （哪两组碰面由抽签决定），输一场即出局；
   · 赢下 16 强赛的 8 支队进入八强，从八强开始双败淘汰：
     胜者组输一场掉进败者组（还有一次机会），败者组再输一场才淘汰，最后总决赛。
   ============================================================ */
const BK_G = ["A","B","C","D"];
const BK_GNAME = { A:"A 组", B:"B 组", C:"C 组", D:"D 组" };
const BK_GCOLOR = { A:"#7c5cff", B:"#0d9488", C:"#c2760a", D:"#be185d" };
const C_WB = "#2f6bff";        // 胜者组
const C_LB = "#e8862a";        // 败者组
const C_SB = "#7b8bab";        // 16 强（单败区）
const C_GF = "#d9a300";        // 总决赛 / 冠军
const BK_ZC = { sb:C_SB, wb:C_WB, lb:C_LB, gf:C_GF };
const BK_ROUNDS = {
  r16: { name:"16强赛",       short:"16强",  zone:"sb", cap:8, tip:"单败淘汰：输了就出局" },
  wb1: { name:"胜者组八强赛", short:"胜八强", zone:"wb", cap:4, tip:"输一场掉进败者组，还有一次机会" },
  wb2: { name:"胜者组半决赛", short:"胜半决", zone:"wb", cap:2, tip:"" },
  wbf: { name:"胜者组决赛",   short:"胜决赛", zone:"wb", cap:1, tip:"赢下直接进总决赛" },
  lb1: { name:"败者组第一轮", short:"败1轮", zone:"lb", cap:2, tip:"败者组：再输一场就淘汰" },
  lb2: { name:"败者组第二轮", short:"败2轮", zone:"lb", cap:2, tip:"" },
  lb3: { name:"败者组半决赛", short:"败半决", zone:"lb", cap:1, tip:"" },
  lbf: { name:"败者组决赛",   short:"败决赛", zone:"lb", cap:1, tip:"赢家进总决赛" },
  gf:  { name:"总决赛",       short:"决赛",  zone:"gf", cap:1, tip:"胜者组冠军 vs 败者组冠军" },
  gf2: { name:"总决赛 · 加赛", short:"加赛", zone:"gf", cap:1, tip:"胜者组冠军先输一场时才需要打" }
};
const BK_ORDER = ["r16","wb1","wb2","wbf","lb1","lb2","lb3","lbf","gf","gf2"];
/* 赛制：16 强 → 胜者组/败者组半决赛之前都是 BO5，从半决赛起 BO7。
   对应关系按「这场比赛的阶段」算，不看它在胜者组还是败者组。 */
const BK_BO = { r16:5, wb1:5, lb1:5, lb2:5, wb2:7, wbf:7, lb3:7, lbf:7, gf:7, gf2:7 };
const bkBoOf = round => BK_BO[round] || 5;
const bkBoNeed = round => Math.ceil(bkBoOf(round) / 2);
const BK_VIEW = { bk16:{w:2560,h:1400}, bkde:{w:2560,h:1440}, bkall:{w:2560,h:2840} };
/* 胜者去哪一场（a/b = 上面/下面那个位置）；败者掉到哪一场 */
const BK_NEXT = {
  "R16-1":["WB1-1","a"], "R16-2":["WB1-1","b"], "R16-3":["WB1-2","a"], "R16-4":["WB1-2","b"],
  "R16-5":["WB1-3","a"], "R16-6":["WB1-3","b"], "R16-7":["WB1-4","a"], "R16-8":["WB1-4","b"],
  "WB1-1":["WB2-1","a"], "WB1-2":["WB2-1","b"], "WB1-3":["WB2-2","a"], "WB1-4":["WB2-2","b"],
  "WB2-1":["WBF","a"],   "WB2-2":["WBF","b"],
  "WBF":["GF","a"],
  "LB1-1":["LB2-1","a"], "LB1-2":["LB2-2","a"],
  "LB2-1":["LB3","a"],   "LB2-2":["LB3","b"],
  "LB3":["LBF","a"],
  "LBF":["GF","b"]
};
const BK_DROP = {
  "WB1-1":["LB1-1","a"], "WB1-2":["LB1-1","b"], "WB1-3":["LB1-2","a"], "WB1-4":["LB1-2","b"],
  "WB2-1":["LB2-1","b"], "WB2-2":["LB2-2","b"],
  "WBF":["LBF","b"]
};

/* ---------- 数据模型 ---------- */
/* 16 强 8 个位置的位次要求：s1=各组第1名 s2=各组第2名 s3=各组第3名 s4=各组第4名。
   顺序固定：上半区 第1~4 场、下半区 第5~8 场；每场一个高名次 + 一个低名次，
   这样每个 1/4 区都正好有一场「1 名打 4 名」和一场「2 名打 3 名」。
   注意：这是「抽队伍」——每个位置放哪支队伍由抽签决定，不限制只能碰哪个组。 */
const BK_R16_TYPE = [["s1","s4"],["s2","s3"],["s2","s3"],["s1","s4"],
                     ["s1","s4"],["s2","s3"],["s2","s3"],["s1","s4"]];
const BK_SLOT_NAME = { s1:"各组第1名", s2:"各组第2名", s3:"各组第3名", s4:"各组第4名" };
function emptyBracket(){
  return { title:"2026 薄扶林王者杯秋季赛", short:"PKC", note:"",
           groups:{ A:["","","",""], B:["","","",""], C:["","","",""], D:["","","",""] },
           draw: BK_R16_TYPE.map(() => ({ a:"", b:"" })), win:{}, score:{} };
}
function normBracket(b){
  const o = emptyBracket();
  if (!b || typeof b !== "object") return o;
  o.title = (b.title === undefined ? o.title : String(b.title));
  o.short = (b.short === undefined ? o.short : String(b.short));
  o.note  = String(b.note || "");
  BK_G.forEach(g => {
    const a = (b.groups && b.groups[g]) || [];
    o.groups[g] = [0,1,2,3].map(i => String(a[i] == null ? "" : a[i]));
  });
  o.draw = Array.isArray(b.draw)
    ? BK_R16_TYPE.map((t,i) => { const d = b.draw[i] || {}; return { a:String(d.a || ""), b:String(d.b || "") }; })
    : bkLegacyDraw(b);                       // 兼容早期用「抽组」存下来的数据
  if (b.win) Object.keys(b.win).forEach(k => { const v = b.win[k]; if (v === "a" || v === "b") o.win[k] = v; });
  if (b.score) Object.keys(b.score).forEach(k => {
    const s = b.score[k] || {};
    o.score[k] = { a:String(s.a == null ? "" : s.a), b:String(s.b == null ? "" : s.b) };
  });
  return o;
}
/** 旧版（按组配对 A×B / A×C / A×D 或自定义）→ 新版「每场两个队伍」*/
function bkLegacyDraw(b){
  const g = b.groups || {};
  const slotId = s => (/^[ABCD][1-4]$/.test(String(s||"")) ? String((g[String(s)[0]] || [])[+String(s)[1]-1] || "") : "");
  let pairs = null;
  if (b.pair === "custom" && Array.isArray(b.custom) && b.custom.length)
    pairs = b.custom.slice(0,8).map(p => ({ a:slotId(p && p.a), b:slotId(p && p.b) }));
  if (!pairs){
    const P = (b.pair === "AC_BD") ? ["A","C"] : (b.pair === "AD_BC") ? ["A","D"] : ["A","B"];
    const Q = (b.pair === "AC_BD") ? ["B","D"] : (b.pair === "AD_BC") ? ["B","C"] : ["C","D"];
    const half = (X,Y) => ([{ a:X+"1", b:Y+"4" }, { a:Y+"2", b:X+"3" },
                            { a:X+"2", b:Y+"3" }, { a:Y+"1", b:X+"4" }]);
    pairs = half(P[0],P[1]).concat(half(Q[0],Q[1])).map(p => ({ a:slotId(p.a), b:slotId(p.b) }));
  }
  return BK_R16_TYPE.map((t,i) => pairs[i] || { a:"", b:"" });
}
function B(){ const s = S.series; if (!s.bracket) s.bracket = emptyBracket(); return s.bracket; }
const bkTitleText = () => (String(B().title || "").trim() || S.series.name || "淘汰赛赛程图");
const bkShortText = () => (String(B().short || "").trim() || "PKC");

/** 16 强对阵：第 i 场就是抽签抽出来的两支队伍（不受分组限制） */
const bkR16Pairs = b => BK_R16_TYPE.map((t,i) => {
  const d = (b.draw && b.draw[i]) || {};
  return { a:(bkTeamID(d.a) ? d.a : ""), b:(bkTeamID(d.b) ? d.b : "") };
});
const bkTeamID = v => (String(v||"") && S.series.teams.some(t => t.id === v)) ? String(v) : "";
/** 这支队伍在分组表里是哪个组的第几名 → "A1"；不在分组表里就返回 "" */
function bkTeamSeed(id){
  if (!id) return "";
  const b = B();
  for (let i = 0; i < BK_G.length; i++){
    const k = (b.groups[BK_G[i]] || []).indexOf(id);
    if (k >= 0) return BK_G[i] + (k+1);
  }
  return "";
}
const bkDrawSummary = () => "抽签决定：各组第 1 名抽另一组的第 4 名、第 2 名抽另一组的第 3 名，同组不碰面";
/** 抽签检查：没排满 / 重复 / 同组碰面 / 位次不对 / 队伍不在分组表里 */
function bkDrawIssues(){
  const b = B(), out = { empty:[], dup:[], same:[], rank:[], outside:[], unplaced:[] };
  const used = {}, inGroups = new Set();
  BK_G.forEach(g => (b.groups[g] || []).forEach(id => { if (id) inGroups.add(id); }));
  const seedOf = id => bkTeamSeed(id);
  let filled = 0;
  for (let i = 0; i < 8; i++){
    const t = BK_R16_TYPE[i], d = (b.draw && b.draw[i]) || {};
    [["a",d.a,t[0]], ["b",d.b,t[1]]].forEach(([side,id,type]) => {
      if (!id) { out.empty.push("第" + (i+1) + "场 " + BK_SLOT_NAME[type]); return; }
      filled++; used[id] = (used[id] || 0) + 1;
      const s = seedOf(id);
      if (!s) out.outside.push(bkTeamName(id));
      else if (s[1] !== type[1]) out.rank.push("第" + (i+1) + "场「" + BK_SLOT_NAME[type] + "」放的是 " + s[0] + "组第" + s[1] + "名 " + bkTeamName(id));
    });
    if (d.a && d.b){
      const sa = seedOf(d.a), sb = seedOf(d.b);
      if (sa && sb && sa[0] === sb[0]) out.same.push("第" + (i+1) + "场：" + bkTeamName(d.a) + " 与 " + bkTeamName(d.b) + " 都是 " + sa[0] + " 组");
    }
  }
  Object.keys(used).forEach(id => { if (used[id] > 1) out.dup.push(bkTeamName(id)); });
  inGroups.forEach(id => { if (!used[id]) out.unplaced.push(bkTeamName(id)); });
  out.filled = filled;
  return out;
}
/** 整张对阵表：自动把上一轮的胜者/败者填进下一轮 */
function bkTree(){
  const b = B(), list = [], map = {}, cnt = {};
  const W = k => { const m = map[k], w = b.win[k]; return (m && (w === "a" || w === "b")) ? (w === "a" ? m.a : m.b) : ""; };
  const L = k => { const m = map[k], w = b.win[k]; return (m && (w === "a" || w === "b")) ? (w === "a" ? m.b : m.a) : ""; };
  const code = k => (map[k] ? map[k].code : "?");
  const add = (key, round, a, bb, aLab, bLab) => {
    const n = (cnt[round] = (cnt[round] || 0) + 1);
    const R = BK_ROUNDS[round];
    const m = { key, round, no:n, code: R.short + (R.cap > 1 ? n : ""),
                bo: bkBoOf(round),
                label: (R.cap > 1 ? (R.name + " 第" + n + "场") : R.name) + " · BO" + bkBoOf(round),
                a, b:bb, aLabel:aLab || "待定", bLabel:bLab || "待定" };
    map[key] = m; list.push(m); return m;
  };
  bkR16Pairs(b).forEach((p,i) => {
    const t = BK_R16_TYPE[i];
    add("R16-"+(i+1), "r16", p.a, p.b, BK_SLOT_NAME[t[0]], BK_SLOT_NAME[t[1]]);
  });
  const wr = k => code(k) + " 胜者";
  const lr = k => code(k) + " 败者";
  add("WB1-1","wb1", W("R16-1"), W("R16-2"), wr("R16-1"), wr("R16-2"));
  add("WB1-2","wb1", W("R16-3"), W("R16-4"), wr("R16-3"), wr("R16-4"));
  add("WB1-3","wb1", W("R16-5"), W("R16-6"), wr("R16-5"), wr("R16-6"));
  add("WB1-4","wb1", W("R16-7"), W("R16-8"), wr("R16-7"), wr("R16-8"));
  add("WB2-1","wb2", W("WB1-1"), W("WB1-2"), wr("WB1-1"), wr("WB1-2"));
  add("WB2-2","wb2", W("WB1-3"), W("WB1-4"), wr("WB1-3"), wr("WB1-4"));
  add("WBF","wbf",   W("WB2-1"), W("WB2-2"), wr("WB2-1"), wr("WB2-2"));
  add("LB1-1","lb1", L("WB1-1"), L("WB1-2"), lr("WB1-1"), lr("WB1-2"));
  add("LB1-2","lb1", L("WB1-3"), L("WB1-4"), lr("WB1-3"), lr("WB1-4"));
  add("LB2-1","lb2", W("LB1-1"), L("WB2-1"), wr("LB1-1"), lr("WB2-1"));
  add("LB2-2","lb2", W("LB1-2"), L("WB2-2"), wr("LB1-2"), lr("WB2-2"));
  add("LB3","lb3",   W("LB2-1"), W("LB2-2"), wr("LB2-1"), wr("LB2-2"));
  add("LBF","lbf",   W("LB3"),   L("WBF"),   wr("LB3"),   lr("WBF"));
  add("GF","gf",     W("WBF"),   W("LBF"),   wr("WBF"),   wr("LBF"));
  add("GF2","gf2",   W("GF"),    L("GF"),    wr("GF"),    lr("GF"));
  return { list, map };
}
const bkWinId = (m, k) => { const w = B().win[k]; return (w === "a" || w === "b") ? (w === "a" ? m.a : m.b) : ""; };
const bkLoseId = (m, k) => { const w = B().win[k]; return (w === "a" || w === "b") ? (w === "a" ? m.b : m.a) : ""; };
const bkNeedReset = () => B().win["GF"] === "b";     // 败者组冠军先赢一场 → 要加赛
function bkChampion(){
  const b = B(), T = bkTree();
  const g = b.win["GF"]; if (g !== "a" && g !== "b") return "";
  if (g === "b"){ if (b.win["GF2"] !== "a" && b.win["GF2"] !== "b") return ""; return bkWinId(T.map["GF2"], "GF2"); }
  return bkWinId(T.map["GF"], "GF");
}
function bkRunnerUp(){
  const b = B(), T = bkTree();
  const g = b.win["GF"]; if (g !== "a" && g !== "b") return "";
  if (g === "b"){ if (b.win["GF2"] !== "a" && b.win["GF2"] !== "b") return ""; return bkLoseId(T.map["GF2"], "GF2"); }
  return bkLoseId(T.map["GF"], "GF");
}
const bkTeamName = id => (id ? (S.team(id).name || "（未命名）") : "");
function bkUsedCount(){
  const c = {};
  const b = B();
  BK_G.forEach(g => b.groups[g].forEach(id => { if (id) c[id] = (c[id] || 0) + 1; }));
  return c;
}

/* ---------- 赛程图实时快照 → 导播台 / OBS ----------
 * 抽签直播时，每次分组/落位改动都推给导播台的「赛程图」现场通道；
 * change 里带上改的是哪一场哪一侧，OBS 端据此做落位强调动画。 */
let bkLiveTimer = null;
function bracketLiveSnapshot(){
  return {
    seriesId: S.series.id,
    title: bkTitleText(),
    short: bkShortText(),
    note: B().note || "",
    groups: JSON.parse(JSON.stringify(B().groups || {})),
    draw: JSON.parse(JSON.stringify(B().draw || [])),
    win: JSON.parse(JSON.stringify(B().win || {})),
    score: JSON.parse(JSON.stringify(B().score || {})),
    teams: (S.series.teams || []).map(t => ({
      id: t.id, name: t.name, color: t.color || "", group: t.group || "",
    })),
  };
}
function publishBracketLive(change, delay){
  const send = () => {
    fetch("/api/director/bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: bracketLiveSnapshot(), change: change || null }),
    }).catch(() => {});
  };
  clearTimeout(bkLiveTimer);
  if (delay) bkLiveTimer = setTimeout(send, delay);
  else send();
}

/* ---------- 界面 ---------- */
function bkTeamOptions(cur){
  const list = S.series.teams.slice().sort((a,b) =>
    String(teamGroupOf(a.id)||a.group||"～").localeCompare(String(teamGroupOf(b.id)||b.group||"～"),"zh")
    || String(a.name||"").localeCompare(String(b.name||""),"zh"));
  return '<option value="">（未选）</option>' + list.map(t =>
    '<option value="'+t.id+'"'+(t.id === cur ? " selected" : "")+'>'
      + esc(((teamGroupOf(t.id)||t.group) ? (teamGroupOf(t.id)||t.group) + " · " : "") + (t.name || "（没有名字）"))
      + (t.eliminated ? "（停用）" : "") + '</option>').join("");
}
function renderBracket(){
  if (!$("#bkGroups")) return;
  const b = B();
  $("#bkTitle").value = (b.title === undefined ? "" : b.title);
  $("#bkShort").value = b.short || "";
  $("#bkNote").value  = b.note || "";
  $("#bkSeriesName").textContent = S.series.name;
  renderBkGroups(); renderBkDraw(); renderBkMatches(); renderBkPreviewArea();
  renderBkLinkWarn();
}
/** 队伍库改名 / 增删后刷新赛程图（不动标题输入框，免得正在打字被清掉） */
function bkOnTeamsChanged(){
  if (!$("#bkGroups")) return;
  renderBkGroups(); renderBkDraw(); renderBkMatches(); renderBkLinkWarn(); scheduleBkRender();
  publishBracketLive({ kind:"meta" }, 120);
}
function renderBkGroups(){
  const host = $("#bkGroups"); if (!host) return;
  const b = B();
  let html = '<table class="bk-gt"><thead><tr><th></th>'
    + BK_G.map(g => '<th><span class="bk-gtag" style="background:'+rgba(BK_GCOLOR[g],.14)+';color:'+BK_GCOLOR[g]+'">'+g+' 组</span></th>').join("")
    + '</tr></thead><tbody>';
  [0,1,2,3].forEach(i => {
    html += '<tr><td class="s">第 ' + (i+1) + ' 名</td>';
    BK_G.forEach(g => {
      html += '<td><select data-g="'+g+'" data-i="'+i+'">'+bkTeamOptions(b.groups[g][i])+'</select></td>';
    });
    html += '</tr>';
  });
  host.innerHTML = html + '</tbody></table>';
  $$("select", host).forEach(sel => {
    sel.onchange = () => {
      B().groups[sel.dataset.g][+sel.dataset.i] = sel.value;
      syncTeamGroups();
      renderBkGroupWarn(); renderBkDraw(); renderBkMatches(); scheduleSave(); scheduleBkRender();
      renderBkLinkWarn();
      publishBracketLive({ kind:"group", group:sel.dataset.g, index:+sel.dataset.i, teamId:sel.value });
    };
  });
  renderBkGroupWarn();
}
function renderBkGroupWarn(){
  const el = $("#bkGroupWarn"); if (!el) return;
  const b = B(), cnt = bkUsedCount();
  const filled = BK_G.reduce((n,g) => n + b.groups[g].filter(Boolean).length, 0);
  const dup = Object.keys(cnt).filter(id => cnt[id] > 1);
  const msgs = [];
  if (filled < 16) msgs.push('<div class="notice warn">已选 <b>'+filled+'/16</b> 支队伍，还差 '+(16-filled)+' 支；没选的位子在图上显示成「A组第1名」这类占位。</div>');
  if (dup.length) msgs.push('<div class="notice bad">同一支队伍被放进了多个位置：<b>'
    + dup.map(id => esc(bkTeamName(id))).join("、") + '</b>（图上会按位置各算一支，请确认）。</div>');
  const same = bkTree().list.filter(m => m.a && m.b && m.a === m.b);
  if (same.length) msgs.push('<div class="notice bad">有 '+same.length+' 场对阵两边是同一支队（'
    + same.map(m => m.label).join("、") + '），请回 ② 抽签 或分组里改。</div>');
  if (!msgs.length) msgs.push('<div class="notice ok">16 支队伍都选好了，可以开始点赛果。</div>');
  el.innerHTML = msgs.join("");
}
/** 抽签下拉：列出队伍库里全部队伍（不限制只能碰哪个组），按「哪个组第几名」排序，重复使用会标出来 */
function bkDrawOptions(cur){
  const used = {};
  (B().draw || []).forEach(d => { [d.a, d.b].forEach(id => { if (id) used[id] = (used[id] || 0) + 1; }); });
  const rank = id => { const s = bkTeamSeed(id); return s ? (BK_G.indexOf(s[0]) * 10 + (+s[1])) : 99; };
  const list = S.series.teams.slice().sort((x,y) => (rank(x.id) - rank(y.id)) || String(x.name||"").localeCompare(String(y.name||""), "zh"));
  return '<option value="">（未选）</option>' + list.map(t => {
    const s = bkTeamSeed(t.id);
    const tag = s ? (s + " · ") : "";
    const dup = (used[t.id] > 1 && t.id !== cur) ? "（已排在别处）" : "";
    return '<option value="'+t.id+'"'+(t.id === cur ? " selected" : "")+'>'
      + esc(tag + (t.name || "（没有名字）") + dup) + '</option>';
  }).join("");
}
function renderBkDraw(){
  const host = $("#bkDrawTable"); if (!host) return;
  const b = B();
  let html = "";
  for (let i = 0; i < 8; i++){
    const t = BK_R16_TYPE[i], d = (b.draw && b.draw[i]) || { a:"", b:"" };
    html += '<div class="bk-draw"><span class="n">第' + (i+1) + '场<br><em>' + (i < 4 ? "上半区" : "下半区") + '</em></span>'
      + '<div class="fld"><label>' + BK_SLOT_NAME[t[0]] + '</label>'
      + '<select data-i="'+i+'" data-s="a">' + bkDrawOptions(d.a) + '</select></div>'
      + '<span class="vs">vs</span>'
      + '<div class="fld"><label>' + BK_SLOT_NAME[t[1]] + '</label>'
      + '<select data-i="'+i+'" data-s="b">' + bkDrawOptions(d.b) + '</select></div></div>';
  }
  host.innerHTML = html;
  $$("select", host).forEach(sel => {
    sel.onchange = () => {
      const b2 = B(), i = +sel.dataset.i;
      b2.draw[i][sel.dataset.s] = sel.value;
      renderBkDraw(); renderBkMatches(); renderBkGroupWarn(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind:"draw", match:i, side:sel.dataset.s, teamId:sel.value });
    };
  });
  renderBkDrawWarn();
}
function renderBkDrawWarn(){
  const el = $("#bkDrawWarn"); if (!el) return;
  const b = B(), iss = bkDrawIssues();
  const msgs = [];
  const anyWin = Object.keys(b.win || {}).length > 0;
  if (iss.filled < 16) msgs.push('<div class="notice warn">16 强对阵还差 <b>' + (16 - iss.filled) + '</b> 个位置没排（空位在图上显示成「各组第1名」这类占位）。</div>');
  if (iss.dup.length) msgs.push('<div class="notice bad">同一支队伍被排进了多场：<b>' + iss.dup.map(esc).join("、") + '</b>。</div>');
  if (iss.same.length) msgs.push('<div class="notice bad">同组碰面（赛制是不同组才碰）：' + iss.same.map(esc).join("；") + '。</div>');
  if (iss.rank.length) msgs.push('<div class="notice warn">位次和赛制对不上：' + iss.rank.map(esc).join("；") + '。确认是有意这样排的就忽略。</div>');
  if (iss.outside.length) msgs.push('<div class="notice warn">这些队不在上面的分组表里，图上不会显示 A1/B2 这种组别标记：<b>' + iss.outside.map(esc).join("、") + '</b>。</div>');
  if (iss.unplaced.length) msgs.push('<div class="hint" style="margin-top:4px">分组里还没排进 16 强对阵：' + iss.unplaced.map(esc).join("、") + '</div>');
  bkTree().list.forEach(m => {
    const sc = b.score[m.key] || {};
    if (isBlank(sc.a) && isBlank(sc.b)) return;
    const need = bkBoNeed(m.round);
    const a = Number(sc.a || 0) || 0, bb = Number(sc.b || 0) || 0;
    if (a > need || bb > need || (a === need && bb === need)){
      msgs.push('<div class="notice bad">「' + esc(m.code) + '」比分 ' + a + ' : ' + bb
        + ' 不符合 BO' + bkBoOf(m.round) + '（先到 ' + need + ' 胜）。</div>');
    }
  });
  if (!msgs.length) msgs.push('<div class="notice ok">16 强对阵已排满，且没有同组碰面。' + (anyWin ? "" : "接着点 ③ 录赛果。") + '</div>');
  el.innerHTML = msgs.join("");
}
function matchRecord(key){
  const m = bkMatchByKey(key);
  const gs = gamesOfMatch(key).map(x => x.game);
  let a = 0, b = 0;
  gs.forEach(g => {
    const winner = g.result === "win" ? g.ourId : (g.result === "lose" ? g.oppId : "");
    if (m && winner && winner === m.a) a += 1;
    else if (m && winner && winner === m.b) b += 1;
  });
  return { games: gs.length, a, b };
}

/* ============================================================
   清除某场（大场）数据
   一场 = 赛程里的一个 matchKey。只删这一场的局、比分、晋级，
   对阵双方 / 分组 / 队伍库 / 其他场次都不动，并给 10 秒撤销。
   ============================================================ */
function matchDisplayName(key){
  const m = bkMatchByKey(key);
  if (!m) return key;
  const a = bkTeamName(m.a) || m.aLabel || "待定";
  const b = bkTeamName(m.b) || m.bLabel || "待定";
  return m.code + " · " + a + " vs " + b;
}
function matchHasData(key){
  if (!key) return false;
  const b = B();
  const sc = b.score[key];
  const hasScore = sc && (!isBlank(sc.a) || !isBlank(sc.b));
  return gamesOfMatch(key).some(x => gameHasData(x.game)) || !!hasScore || !!b.win[key];
}
function refreshAllAfterMatchChange(){
  renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview();
  renderMgInfo(); renderBracket(); publishContext(0); scheduleSave();
}
function showUndoBar(text, onUndo){
  let el = document.getElementById("pkcUndo");
  if (!el){
    el = document.createElement("div");
    el.id = "pkcUndo";
    el.className = "pkc-undo";
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = text;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "撤销";
  el.append(span, btn);
  el.classList.add("on");
  clearTimeout(el._t);
  const hide = () => { el.classList.remove("on"); clearTimeout(el._t); };
  btn.onclick = () => { hide(); onUndo(); };
  el._t = setTimeout(hide, 10000);
}
function clearMatchData(key){
  const m = bkMatchByKey(key);
  if (!m){ toast("找不到这场赛程"); return null; }
  const b = B();
  const list = gamesOfMatch(key);
  const snapshot = {
    key,
    name: matchDisplayName(key),
    games: list.map(x => x.game),
    indexes: list.map(x => x.index),
    current: S.series.current,
    score: b.score[key] ? { ...b.score[key] } : null,
    win: b.win[key] || null,
  };

  const gone = new Set(snapshot.games);
  S.series.games = S.series.games.filter(g => !gone.has(g));
  delete b.score[key];
  delete b.win[key];

  if (S.series.games.length){
    const at = snapshot.indexes.length ? snapshot.indexes[0] : S.series.current;
    S.series.current = clamp(Math.min(at, S.series.games.length - 1), 0, S.series.games.length - 1);
  } else {
    const ng = newGame("第1局", key);
    ng.ourId = m.a || "";
    ng.oppId = m.b || "";
    S.series.games.push(ng);
    S.series.current = 0;
  }

  refreshAllAfterMatchChange();
  const n = snapshot.games.length;
  showUndoBar("已清除「" + snapshot.name + "」的 " + n + " 局数据", () => restoreMatchData(snapshot));
  return snapshot;
}
function restoreMatchData(snapshot){
  if (!snapshot) return;
  const pairs = snapshot.games
    .map((g, i) => ({ g, i: snapshot.indexes[i] }))
    .sort((x, y) => x.i - y.i);
  pairs.forEach(({ g, i }) => {
    const at = Math.max(0, Math.min(i, S.series.games.length));
    S.series.games.splice(at, 0, g);
  });
  const b = B();
  if (snapshot.score) b.score[snapshot.key] = snapshot.score;
  else delete b.score[snapshot.key];
  if (snapshot.win) b.win[snapshot.key] = snapshot.win;
  else delete b.win[snapshot.key];
  S.series.current = clamp(snapshot.current, 0, S.series.games.length - 1);
  refreshAllAfterMatchChange();
  toast("已撤销，数据已恢复");
}
function confirmClearMatch(key){
  if (!key) return;
  if (!matchHasData(key)){ toast("这场还没有可清除的数据"); return; }
  const n = gamesOfMatch(key).filter(x => gameHasData(x.game)).length;
  const name = matchDisplayName(key);
  if (!confirm("清除「" + name + "」的全部数据？\n\n将删除 " + n + " 局对局记录，以及这场在赛程里的比分和晋级标记。\n对阵双方、分组和其他场次不受影响。")) return;
  clearMatchData(key);
}

function bkLinkIssues(){
  const out = [];
  const seen = new Set();
  S.series.games.forEach(g => {
    const key = g.matchKey || "";
    if (!key) return;
    const m = bkMatchByKey(key);
    if (!m){
      out.push({ kind: "orphan", key, text: "「" + g.label + "」关联的场次 " + key + " 已不在赛程里" });
      return;
    }
    const msg = matchTeamMismatch(key, g);
    const sig = key + "|" + msg;
    if (msg && !seen.has(sig)){
      seen.add(sig);
      out.push({ kind: "team", key, text: "「" + m.code + "」" + msg });
    }
  });
  return out;
}
function renderBkLinkWarn(){
  const host = $("#bkLinkWarn");
  if (!host) return;
  const issues = bkLinkIssues();
  host.innerHTML = issues.map(i => '<div class="notice bad">⚠ ' + esc(i.text) + '</div>').join("");
  host.style.display = issues.length ? "" : "none";
}
function renderBkMatches(){
  const host = $("#bkMatches"); if (!host) return;
  const b = B(), T = bkTree();
  let html = "";
  BK_ORDER.forEach(rd => {
    const arr = T.list.filter(m => m.round === rd);
    if (!arr.length) return;
    if (rd === "gf2" && !bkNeedReset()) return;                     // 只有需要加赛时才出现
    const R = BK_ROUNDS[rd];
    html += '<div class="bk-round-h"><span class="z" style="background:'+rgba(BK_ZC[R.zone],.14)+';color:'+BK_ZC[R.zone]+'">'
      + R.name + '</span>'
      + '<span style="margin-left:8px;padding:2px 9px;border-radius:999px;background:rgba(47,107,255,.12);color:#2f6bff;'
      + 'font:700 11px/1.6 Bahnschrift,system-ui,sans-serif;letter-spacing:.06em">BO' + bkBoOf(rd) + '</span>'
      + (R.tip ? '<span class="tip">'+R.tip+'</span>' : '') + '</div>';
    arr.forEach(m => {
      const sc = b.score[m.key] || {}, wv = b.win[m.key];
      const rec = matchRecord(m.key);
      const cell = side => {
        const id = side === "a" ? m.a : m.b, lab = side === "a" ? m.aLabel : m.bLabel;
        const t2 = id ? S.team(id) : null;
        const cls = "bk-pick" + (wv === side ? " w" : "");
        return '<button class="'+cls+'" data-k="'+m.key+'" data-s="'+side+'" title="点一下＝这支队伍赢了这场（再点取消）">'
          + (t2 ? '<i class="dot" style="background:'+esc(t2.color||"#8aa")+'"></i>' : '<i class="dot" style="background:#c9d3e2"></i>')
          + '<span class="nm">'+esc(id ? bkTeamName(id) : lab)+'</span></button>';
      };
      html += '<div class="bk-m"><span class="bk-code">'+(m.code || "")+'</span>'
        + cell("a")
        + '<input class="bk-sc" data-k="'+m.key+'" data-s="a" value="'+esc(sc.a||"")+'" placeholder="-"'
        + ' max="'+bkBoNeed(m.round)+'" title="BO'+bkBoOf(m.round)+' · 先到 '+bkBoNeed(m.round)+' 胜">'
        + '<span class="bk-vs">:</span>'
        + '<input class="bk-sc" data-k="'+m.key+'" data-s="b" value="'+esc(sc.b||"")+'" placeholder="-"'
        + ' max="'+bkBoNeed(m.round)+'" title="BO'+bkBoOf(m.round)+' · 先到 '+bkBoNeed(m.round)+' 胜">'
        + cell("b")
        + '</div>'
        + '<div class="bk-linkbar">'
        + '<button class="mini bk-data" data-k="'+m.key+'" '+(m.a && m.b ? "" : "disabled")
        + ' title="录入/查看这场赛后数据">📊 录数据</button>'
        + '<button class="mini bk-sync" data-k="'+m.key+'" '+(rec.games ? "" : "disabled")
        + ' title="用已录局分回填大比分">回填赛果</button>'
        + (rec.games ? '<span class="bk-rec">已录 '+rec.games+' 局 · '+rec.a+':'+rec.b+'</span>' : '<span class="bk-rec empty">本场还没有局数据</span>')
        + '<button class="mini bk-clr" data-k="'+m.key+'" title="只清空比分和晋级，保留对局数据">↺ 清比分</button>'
        + '<button class="mini bk-del" data-k="'+m.key+'" title="删除这场全部对局数据和赛果">🗑 清除这场</button>'
        + '</div>';
    });
  });
  host.innerHTML = html;
  $$(".bk-pick", host).forEach(el => {
    el.onclick = () => {
      const b2 = B(), k = el.dataset.k, s = el.dataset.s;
      if (b2.win[k] === s) delete b2.win[k]; else b2.win[k] = s;
      renderBkMatches(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind:"win", key:k, side:s });
    };
  });
  $$(".bk-sc", host).forEach(el => {
    el.oninput = () => {
      const b2 = B(), k = el.dataset.k;
      b2.score[k] = b2.score[k] || { a:"", b:"" };
      b2.score[k][el.dataset.s] = el.value;
      scheduleSave(); scheduleBkRender(200);
      publishBracketLive({ kind:"meta" }, 260);
    };
  });
  $$(".bk-clr", host).forEach(el => {
    el.onclick = () => {
      const b2 = B(), k = el.dataset.k;
      delete b2.win[k]; delete b2.score[k];
      renderBkMatches(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind:"meta" });
    };
  });
  $$(".bk-del", host).forEach(el => {
    el.onclick = () => confirmClearMatch(el.dataset.k);
  });
  $$(".bk-data", host).forEach(el => {
    el.onclick = () => { openMatch(el.dataset.k); };
  });
  $$(".bk-sync", host).forEach(el => {
    el.onclick = () => {
      const k = el.dataset.k, rec = matchRecord(k), m = bkMatchByKey(k);
      if (!rec.games || !m) return;
      const winner = rec.a === rec.b ? "" : bkTeamName(rec.a > rec.b ? m.a : m.b);
      const ok = confirm("用这场已录的 " + rec.games + " 局把比分填成 " + rec.a + " : " + rec.b + "？"
        + (winner ? "\n并把「" + winner + "」标记为晋级。" : "\n平局只填比分，不标记晋级。"));
      if (!ok) return;
      const b2 = B();
      b2.score[k] = { a: String(rec.a), b: String(rec.b) };
      if (rec.a !== rec.b) b2.win[k] = rec.a > rec.b ? "a" : "b";
      renderBracket(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind: "win", key: k, side: b2.win[k] || "a" });
    };
  });
  renderBkLinkWarn();
}
function bkAutoFill(){
  const b = B();
  const teams = S.series.teams.slice()
    .filter(t => !t.eliminated && bkTeamStatus(t.id).state !== "out")
    .sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "zh"));
  if (!teams.length) return toast("队伍库还是空的，先去 ② 队伍库 添加队伍");
  let k = 0;
  BK_G.forEach(g => { for (let i = 0; i < 4; i++) b.groups[g][i] = teams[k] ? teams[k++].id : ""; });
  syncTeamGroups();
  renderBracket(); scheduleSave();
  publishBracketLive({ kind:"bulk" });
  toast(teams.length >= 16 ? "已按队伍库顺序填满 4 组，接着把抽签结果填进 ② 的 8 场对阵" : ("队伍库只有 " + teams.length + " 支，剩下的位子留空了"));
}
function bkCopyText(){
  const b = B(), T = bkTree();
  const out = [];
  out.push("【" + bkTitleText() + " · 淘汰赛赛程】");
  if (b.note) out.push(b.note);
  out.push("抽签规则：" + bkDrawSummary());
  out.push("");
  const sideName = (m, side) => {
    const id = side === "a" ? m.a : m.b;
    return id ? bkTeamName(id) : (side === "a" ? m.aLabel : m.bLabel);
  };
  BK_ORDER.forEach(rd => {
    const arr = T.list.filter(m => m.round === rd);
    if (!arr.length) return;
    if (rd === "gf2" && !bkNeedReset()) return;
    const R = BK_ROUNDS[rd];
    out.push("— " + R.name + " · BO" + bkBoOf(rd) + (R.tip ? "（" + R.tip + "）" : "") + " —");
    arr.forEach(m => {
      const sc = b.score[m.key] || {};
      const hasSc = !isBlank(sc.a) || !isBlank(sc.b);
      const wv = b.win[m.key];
      out.push(m.code + "　" + sideName(m,"a") + " vs " + sideName(m,"b")
        + (hasSc ? "　" + (sc.a || "-") + " : " + (sc.b || "-") : "")
        + (wv ? "　→ " + (wv === "a" ? sideName(m,"a") : sideName(m,"b")) + " 晋级" : ""));
    });
    out.push("");
  });
  const ch = bkChampion();
  out.push("冠军：" + (ch ? bkTeamName(ch) : "待定"));
  const txt = out.join("\n");
  const done = () => toast("文字版赛程已复制到剪贴板");
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done).catch(() => fallback());
  } else fallback();
  function fallback(){
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch(e){ toast("复制失败，请手动复制"); }
    ta.remove();
  }
}

/* ---------- 绘制 ---------- */
function bkSpread(y0, y1, n, h){
  if (n <= 1) return [(y0 + y1) / 2];
  const gap = (y1 - y0 - n*h) / (n - 1);
  return Array.from({ length:n }, (_, i) => y0 + h/2 + i*(h + gap));
}
function bkRowY(g, side){
  const top = g.y + 26, rh = g.h - 26;
  return top + rh * (side === "a" ? 0.27 : 0.73);
}
function bkBg(ctx, W, H, oy){
  const t = th();
  const g = ctx.createLinearGradient(0, oy, 0, oy + H);
  g.addColorStop(0, t.bgTop); g.addColorStop(1, t.bgBottom);
  ctx.fillStyle = g; ctx.fillRect(0, oy, W, H);
  let rg = ctx.createRadialGradient(W*0.06, oy + H*0.05, 0, W*0.06, oy + H*0.05, W*0.55);
  rg.addColorStop(0, rgba(C_WB, t.isDark ? .20 : .11)); rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, oy, W, H);
  rg = ctx.createRadialGradient(W*0.96, oy + H*0.94, 0, W*0.96, oy + H*0.94, W*0.55);
  rg.addColorStop(0, rgba(C_LB, t.isDark ? .16 : .10)); rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, oy, W, H);
  ctx.save();
  ctx.globalAlpha = t.isDark ? .035 : .026;
  ctx.strokeStyle = t.isDark ? "#9fc3ff" : "#5b7ba8";
  ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 70){ ctx.beginPath(); ctx.moveTo(i, oy + H); ctx.lineTo(i + H, oy); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = rgba(C_SB, .95); ctx.fillRect(0, oy, W/3, 6);
  ctx.fillStyle = rgba(C_WB, .95); ctx.fillRect(W/3, oy, W/3, 6);
  ctx.fillStyle = rgba(C_LB, .95); ctx.fillRect(W*2/3, oy, W/3, 6);
}
function bkHead(ctx, W, oy, tag){
  const t = th();
  const grad = ctx.createLinearGradient(60, oy+30, 116, oy+86);
  grad.addColorStop(0, "#ffd76a"); grad.addColorStop(1, "#ff9f2e");
  rr(ctx, 60, oy+30, 56, 56, 15); ctx.fillStyle = grad; ctx.fill();
  const sn = bkShortText();
  FT(ctx, sn, 88, oy+59, { size: sn.length > 4 ? 15 : (sn.length > 3 ? 17 : 20),
    weight:"800", align:"center", color:"#4a3200", family:FN, maxWidth:48 });
  const note = (B().note || "").trim();
  const titleW = W - 132 - (note ? 760 : 120);
  fitText(ctx, bkTitleText(), 132, oy+58, { size:42, weight:"700", color:t.ink, maxWidth:titleW, spacing:1 });
  fitText(ctx, tag, 132, oy+104, { size:21, color:t.sub, maxWidth:titleW });
  if (note) fitText(ctx, note, W-60, oy+104, { size:21, weight:"700", align:"right", color:C_WB, maxWidth:700 });
  ctx.fillStyle = t.headLine; ctx.fillRect(60, oy+150, W-120, 1.5);
}
function bkSec(ctx, x, y, text, color){
  const t = th();
  ctx.fillStyle = color || t.faint;
  rr(ctx, x, y-10, 5, 20, 3); ctx.fill();
  fitText(ctx, text, x+14, y, { size:21, weight:"700", color: color || t.sub, maxWidth:1000 });
}
function bkWrap(ctx, str, x, y, maxW, o){
  const size = o.size || 20, lh = o.lineHeight || Math.round(size*1.62);
  setFont(ctx, size, o.weight || "400", o.family, o.spacing);
  ctx.fillStyle = o.color; ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle";
  let yy = y;
  String(str).split("\n").forEach(par => {
    let line = "";
    Array.from(par).forEach(ch => {
      if (line && ctx.measureText(line + ch).width > maxW){ ctx.fillText(line, x, yy); yy += lh; line = ch; }
      else line += ch;
    });
    ctx.fillText(line, x, yy); yy += lh;
  });
  return yy;
}
function bkBand(ctx, x, y, w, h, color, title, sub){
  const t = th();
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = rgba(color, t.isDark ? .10 : .055); ctx.fill();
  ctx.strokeStyle = rgba(color, t.isDark ? .30 : .22); ctx.lineWidth = 2; ctx.stroke();
  rr(ctx, x+18, y+16, 150, 36, 9); ctx.fillStyle = rgba(color, .18); ctx.fill();
  T(ctx, title, x+93, y+35, { size:22, weight:"700", align:"center", color });
  fitText(ctx, sub, x+182, y+35, { size:19, color:t.sub, maxWidth:w-210 });
}
function bkCard(ctx, g, m, opt){
  opt = opt || {};
  const t = th(), b = B();
  const R = BK_ROUNDS[m.round], zc = BK_ZC[R.zone];
  const wv = b.win[m.key], dec = (wv === "a" || wv === "b");
  ctx.save();
  ctx.shadowColor = t.shadow; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  rr(ctx, g.x, g.y, g.w, g.h, 13);
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.95)";
  ctx.fill();
  ctx.restore();
  rr(ctx, g.x, g.y, g.w, g.h, 13);
  ctx.strokeStyle = dec ? rgba(zc,.6) : t.frame;
  ctx.lineWidth = dec ? 2 : 1.4; ctx.stroke();
  rr(ctx, g.x, g.y+9, 5, g.h-18, 3);
  ctx.fillStyle = rgba(zc, dec ? .95 : .5); ctx.fill();
  fitText(ctx, m.label, g.x+18, g.y+15, { size:15, weight:"700", color: dec ? zc : t.faint, maxWidth:g.w-36 });
  [["a", m.a, m.aLabel], ["b", m.b, m.bLabel]].forEach(row => {
    const side = row[0], id = row[1], lab = row[2], seed = bkTeamSeed(id);
    const cy = bkRowY(g, side), win = dec && wv === side;
    const lost = dec && !win;
    if (win){
      rr(ctx, g.x+7, cy-15, g.w-14, 30, 8);
      ctx.fillStyle = rgba(zc, t.isDark ? .20 : .12); ctx.fill();
    }
    let cx = g.x + 16;
    if (opt.seed && seed){
      rr(ctx, cx, cy-10, 34, 20, 6);
      ctx.fillStyle = rgba(BK_GCOLOR[seed[0]], .16); ctx.fill();
      T(ctx, seed, cx+17, cy+1, { size:13, weight:"700", align:"center", color:BK_GCOLOR[seed[0]], family:FN });
      cx += 44;
    }
    const dot = id ? (S.team(id).color || "#8aa") : (t.isDark ? "rgba(255,255,255,.22)" : "#c9d3e2");
    ctx.beginPath(); ctx.arc(cx+5, cy, 5, 0, Math.PI*2); ctx.fillStyle = dot; ctx.fill();
    cx += 18;
    const name = id ? bkTeamName(id) : lab;
    fitText(ctx, name, cx, cy, { size:22, weight: (win || !id) ? "700" : "400",
      color: win ? t.ink : (lost ? t.faint : (id ? t.ink : t.faint)), maxWidth:g.w - (cx - g.x) - 62 });
    const sc = (b.score[m.key] || {})[side] || "";
    if (win) T(ctx, "✓", g.x+g.w-52, cy, { size:20, weight:"700", align:"center", color:zc });
    T(ctx, isBlank(sc) ? "-" : String(sc), g.x+g.w-16, cy,
      { size:23, weight:"700", align:"right", color: win ? zc : t.faint, family:FN });
  });
}
function bkElbow(ctx, x0, y0, x1, y1, color, solid){
  const mx = (x0 + x1) / 2;
  ctx.save();
  ctx.strokeStyle = rgba(color, solid ? .8 : .3);
  ctx.lineWidth = solid ? 3.2 : 2;
  if (!solid) ctx.setLineDash([9, 8]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx, y0); ctx.lineTo(mx, y1); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.restore();
}
function bkLines(ctx, geo, T){
  const b = B();
  const zoneOf = k => (T && T.map[k] ? BK_ZC[BK_ROUNDS[T.map[k].round].zone] : C_SB);
  Object.keys(BK_DROP).forEach((k, i) => {
    const from = geo[k]; if (!from) return;
    const to = BK_DROP[k], tg = geo[to[0]]; if (!tg) return;
    const rowY = bkRowY(tg, to[1]), chan = 22 + i*6;      // 通道都留在卡片左边（<60）避免压住卡片
    ctx.save();
    ctx.setLineDash([9, 8]); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(C_LB, .3);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + from.h/2);
    ctx.lineTo(chan, from.y + from.h/2);
    ctx.lineTo(chan, rowY);
    ctx.lineTo(tg.x, rowY);
    ctx.stroke();
    ctx.restore();
  });
  Object.keys(BK_NEXT).forEach(k => {
    const from = geo[k]; if (!from) return;
    const to = BK_NEXT[k], tg = geo[to[0]]; if (!tg) return;
    bkElbow(ctx, from.x + from.w, from.y + from.h/2, tg.x, bkRowY(tg, to[1]),
      zoneOf(k), !!b.win[k]);
  });
  if (geo["GF"] && geo["GF2"]){                      // 总决赛 → 加赛（需要时那一场）
    const A = geo["GF"], G2 = geo["GF2"];
    ctx.save();
    ctx.setLineDash([9, 8]); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C_GF, .6);
    ctx.beginPath();
    ctx.moveTo(A.x + A.w/2, A.y + A.h);
    ctx.lineTo(G2.x + G2.w/2, G2.y);
    ctx.stroke();
    ctx.restore();
  }
}
function bkGeomR16(oy){
  const geo = {}, w = 760, h = 92;
  const c8 = bkSpread(oy+200, oy+1152, 8, h);
  c8.forEach((c,i) => { geo["R16-"+(i+1)] = { x:760, y:c-h/2, w, h, cy:c }; });
  const q = [];
  for (let i = 0; i < 8; i += 2) q.push((c8[i] + c8[i+1]) / 2);
  q.forEach((c,i) => { geo["WB1-"+(i+1)] = { x:1580, y:c-h/2, w, h, cy:c }; });
  return geo;
}
function bkGeomDE(oy){
  const geo = {}, w = 286, h = 96;
  const C = [60, 390, 720, 1050, 1380, 1710];
  const wb1 = bkSpread(oy+232, oy+806, 4, h);
  wb1.forEach((c,i) => { geo["WB1-"+(i+1)] = { x:C[0], y:c-h/2, w, h, cy:c }; });
  const wb2 = [(wb1[0]+wb1[1])/2, (wb1[2]+wb1[3])/2];
  wb2.forEach((c,i) => { geo["WB2-"+(i+1)] = { x:C[1], y:c-h/2, w, h, cy:c }; });
  const wbf = (wb2[0]+wb2[1])/2;
  geo["WBF"] = { x:C[2], y:wbf-h/2, w, h, cy:wbf };
  const lb = bkSpread(oy+884, oy+1240, 2, h);
  lb.forEach((c,i) => { geo["LB1-"+(i+1)] = { x:C[1], y:c-h/2, w, h, cy:c }; });
  lb.forEach((c,i) => { geo["LB2-"+(i+1)] = { x:C[2], y:c-h/2, w, h, cy:c }; });
  const lb3 = (lb[0]+lb[1])/2;
  geo["LB3"] = { x:C[3], y:lb3-h/2, w, h, cy:lb3 };
  geo["LBF"] = { x:C[4], y:lb3-h/2, w, h, cy:lb3 };
  const gf = (wbf + lb3) / 2;
  geo["GF"] = { x:C[5], y:gf-h/2, w, h, cy:gf };
  geo["GF2"] = { x:C[5], y:gf+62, w, h, cy:gf+62+h/2 };   // 总决赛的加赛（败者组冠军先赢才需要）
  return geo;
}
function bkGroupCard(ctx, x, y, w, h, g){
  const t = th(), b = B(), col = BK_GCOLOR[g];
  rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.9)"; ctx.fill();
  ctx.strokeStyle = rgba(col, .35); ctx.lineWidth = 2; ctx.stroke();
  rr(ctx, x, y, w, 52, 16); ctx.fillStyle = rgba(col, .13); ctx.fill();
  ctx.fillRect(x, y+34, w, 18);
  T(ctx, g + " 组", x+18, y+26, { size:24, weight:"700", color:col });
  fitText(ctx, "已填 " + b.groups[g].filter(Boolean).length + "/4", x+w-18, y+26,
    { size:17, align:"right", color:t.sub, maxWidth:120 });
  [0,1,2,3].forEach(i => {
    const cy = y + 52 + 21 + i*42;
    const id = b.groups[g][i], team = id ? S.team(id) : null;
    rr(ctx, x+14, cy-11, 52, 22, 6);
    ctx.fillStyle = rgba(col, .13); ctx.fill();
    T(ctx, "第" + (i+1) + "名", x+40, cy+1, { size:13, weight:"700", align:"center", color:col });
    ctx.beginPath(); ctx.arc(x+82, cy, 5, 0, Math.PI*2);
    ctx.fillStyle = team ? (team.color || "#8aa") : (t.isDark ? "rgba(255,255,255,.2)" : "#c9d3e2");
    ctx.fill();
    fitText(ctx, id ? bkTeamName(id) : "（未选）", x+96, cy,
      { size:21, weight: id ? "700" : "400", color: id ? t.ink : t.faint, maxWidth:w-116 });
  });
}
function bkChampPanel(ctx, x, y, w, h){
  const t = th();
  rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.9)"; ctx.fill();
  ctx.strokeStyle = rgba(C_GF, .5); ctx.lineWidth = 2.4; ctx.stroke();
  const ch = bkChampion(), ru = bkRunnerUp();
  T(ctx, "冠军", x+22, y+36, { size:23, weight:"700", color:C_GF });
  T(ctx, "CHAMPION", x+w-22, y+36, { size:15, weight:"700", align:"right", color:rgba(C_GF,.75), family:FN, spacing:3 });
  fitText(ctx, ch ? bkTeamName(ch) : "待定", x+22, y+94, { size:38, weight:"700", color: ch ? t.ink : t.faint, maxWidth:w-44 });
  ctx.fillStyle = t.headLine; ctx.fillRect(x+22, y+134, w-44, 1.4);
  T(ctx, "亚军", x+22, y+172, { size:21, weight:"700", color:t.sub });
  fitText(ctx, ru ? bkTeamName(ru) : "待定", x+22, y+214, { size:29, weight:"700", color: ru ? t.ink : t.faint, maxWidth:w-44 });
}
function bkHowTo(ctx, x, y, w, h){
  const t = th();
  T(ctx, "怎么看这张图", x, y+16, { size:23, weight:"700", color:t.ink });
  ctx.fillStyle = t.headLine; ctx.fillRect(x, y+38, w, 1.4);
  let yy = y + 68;
  const blocks = [
    ["胜者组", "赢了继续留在胜者组；第一次输球就掉进败者组，还有一次机会。"],
    ["败者组", "从胜者组掉下来的队在这里继续打，只要再输一场就被淘汰。"],
    ["✓ 胜者", "每场分上下两行，一行一支队；行末带 ✓ 的是赢下这场的队伍，灰色那行是这场输的一方。"],
    ["总决赛", "胜者组冠军 vs 败者组冠军。如果败者组冠军先赢一场，双方各有一败，要加赛一场定冠军。"]
  ];
  blocks.forEach(bk => {
    T(ctx, bk[0], x, yy, { size:19, weight:"700", color:C_WB });
    yy = bkWrap(ctx, bk[1], x, yy+32, w, { size:18, color:t.sub, lineHeight:30 });
    yy += 14;
  });
}
function bkLegend(ctx, W, H, oy){
  const t = th();
  const y = oy + H - 168, h = 78, x0 = 40, w = W - 80;
  rr(ctx, x0, y, w, h, 14);
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.78)"; ctx.fill();
  ctx.strokeStyle = t.frame; ctx.lineWidth = 1.4; ctx.stroke();
  const items = [
    { c:C_SB, t:"16 强赛 · 单败", d:"输一场直接出局" },
    { c:C_WB, t:"胜者组",       d:"输一场掉进败者组，还有一次机会" },
    { c:C_LB, t:"败者组",       d:"再输一场就被淘汰" },
    { c:C_GF, t:"总决赛",       d:"决出全年冠军" },
    { c:t.ink, t:"实线 / 虚线", d:"实线 = 已分出胜负的晋级路线" }
  ];
  const iw = (w - 40) / items.length;
  items.forEach((it,i) => {
    const x = x0 + 20 + i*iw;
    rr(ctx, x, y+26, 24, 24, 7); ctx.fillStyle = rgba(it.c, .85); ctx.fill();
    T(ctx, it.t, x+36, y+30, { size:20, weight:"700", color:t.ink });
    fitText(ctx, it.d, x+36, y+55, { size:17, color:t.sub, maxWidth:iw-50 });
  });
}
function bkFooter(ctx, W, H, oy){
  const t = th();
  if (DB.prefs.footer) fitText(ctx, DB.prefs.footer, W/2, oy+H-34, { size:19, align:"center", color:t.faint, maxWidth:W*0.4 });
  fitText(ctx, bkTitleText() + " · 淘汰赛赛程图 · 由 PKC 赛后数据图生成器生成", W-60, oy+H-34,
    { size:19, align:"right", color:t.faint, maxWidth:W*0.45 });
}
function drawBk16(ctx, oy, opt){
  oy = oy || 0; opt = opt || {};
  const W = BK_VIEW.bk16.w, H = BK_VIEW.bk16.h, T = bkTree();
  if (opt.bg !== false) bkBg(ctx, W, H, oy);
  bkHead(ctx, W, oy, "淘汰赛赛程图 · 16 强单败淘汰 → 决出八强");
  bkSec(ctx, 60, oy+178, "预选赛分组 · 每组前 4 名晋级 16 强");
  bkSec(ctx, 760, oy+178, "16 强赛 · 单败淘汰（输一场就出局）", C_SB);
  bkSec(ctx, 1580, oy+178, "八强赛 · 从这里开始双败（输一场还有机会）", C_WB);
  BK_G.forEach((g,i) => bkGroupCard(ctx, 60, oy+200 + i*(220+24), 640, 220, g));
  const geo = bkGeomR16(oy);
  bkLines(ctx, geo, T);
  T.list.forEach(m => { const g = geo[m.key]; if (g) bkCard(ctx, g, m, { seed: m.round === "r16" }); });
  if (opt.footer !== false){ bkLegend(ctx, W, H, oy); bkFooter(ctx, W, H, oy); }
}
function bkRulePanel(ctx, x, y, w){
  const t = th();
  let yy = y + 26;
  yy = bkWrap(ctx, "预选赛分成 A / B / C / D 四个组，每组前 4 名晋级，一共 16 支队进入淘汰赛。", x, yy, w, { size:20, color:t.ink, lineHeight:34 });
  yy += 18;
  const rules = [
    ["①", "每组第 1 名，对阵另一组的第 4 名。"],
    ["②", "每组第 2 名，对阵另一组的第 3 名。"],
    ["③", "具体谁打谁由抽签决定：抽的是队伍（各组第 1 名抽另一组的第 4 名、第 2 名抽第 3 名），同组不碰面，其它哪个组都行。"],
    ["④", "16 强赛是单败淘汰：输一场就出局。"],
    ["⑤", "赢下 16 强赛的 8 支队进入八强；从八强开始改成双败淘汰，输一场还有一次机会。"]
  ];
  rules.forEach(r => {
    rr(ctx, x, yy-13, 30, 26, 8); ctx.fillStyle = rgba(C_WB,.14); ctx.fill();
    T(ctx, r[0], x+15, yy+1, { size:16, weight:"700", align:"center", color:C_WB });
    yy = bkWrap(ctx, r[1], x+42, yy, w-42, { size:19, color:t.sub, lineHeight:32 }) + 16;
  });
  yy += 10;
  ctx.fillStyle = t.headLine; ctx.fillRect(x, yy, w, 1.4); yy += 30;
  T(ctx, "晋级到八强的 4 组对阵", x, yy, { size:21, weight:"700", color:t.ink }); yy += 36;
  const T2 = bkTree();
  ["WB1-1","WB1-2","WB1-3","WB1-4"].forEach((k,i) => {
    const m = T2.map[k];
    fitText(ctx, "八强第 " + (i+1) + " 场：" + (m.a ? bkTeamName(m.a) : m.aLabel)
      + "　vs　" + (m.b ? bkTeamName(m.b) : m.bLabel), x, yy, { size:18, color:t.sub, maxWidth:w });
    yy += 30;
  });
  bkFlowDiagram(ctx, x, yy + 34, w);
}
/** 整届淘汰赛的流程：16强 → 八强 → 胜者组/败者组 → 总决赛 → 冠军 */
function bkFlowDiagram(ctx, x, y, w){
  const t = th();
  T(ctx, "整届淘汰赛怎么走", x, y, { size:22, weight:"700", color:t.ink });
  const n = 4, gap = 20, bw = (w - gap*(n-1)) / n, bh = 122, by = y + 26;
  const steps = [
    ["16 强赛", "单败：输一场出局", "16 支队", C_SB],
    ["八强赛", "双败开始，输一场还有机会", "8 支队", C_WB],
    ["胜者组 / 败者组", "输一场掉进败者组", "4 支队", C_LB],
    ["总决赛", "决出最终冠军", "冠军", C_GF]
  ];
  steps.forEach((s,i) => {
    const bx = x + i*(bw+gap);
    rr(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = rgba(s[3], .10); ctx.fill();
    ctx.strokeStyle = rgba(s[3], .38); ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = rgba(s[3], .9); ctx.fillRect(bx, by, bw, 5);
    fitText(ctx, s[0], bx+bw/2, by+30, { size:19, weight:"700", align:"center", color:s[3], maxWidth:bw-16 });
    bkWrap(ctx, s[1], bx+14, by+58, bw-28, { size:14, color:t.sub, lineHeight:22 });
    fitText(ctx, s[2], bx+bw/2, by+bh-16, { size:14, weight:"700", align:"center", color:t.faint, maxWidth:bw-16 });
    if (i < n-1) T(ctx, "▶", bx+bw+gap/2, by+bh/2, { size:15, align:"center", color:t.faint });
  });
  const cy = by + bh + 34;
  rr(ctx, x, cy, w, 76, 12);
  ctx.fillStyle = rgba(C_GF, .10); ctx.fill();
  ctx.strokeStyle = rgba(C_GF, .4); ctx.lineWidth = 1.6; ctx.stroke();
  rr(ctx, x, cy, 5, 76, 3); ctx.fillStyle = rgba(C_GF, .95); ctx.fill();
  T(ctx, "抽签怎么抽", x+18, cy+24, { size:18, weight:"700", color:C_GF });
  fitText(ctx, "抽的是队伍：各组第 1 名抽另一组的第 4 名、第 2 名抽另一组的第 3 名，同组不碰面；抽到哪支队就进哪个位置。",
    x+18, cy+52, { size:17, color:t.sub, maxWidth:w-36 });
}
function drawBkDE(ctx, oy, opt){
  oy = oy || 0; opt = opt || {};
  const W = BK_VIEW.bkde.w, H = BK_VIEW.bkde.h, T = bkTree();
  if (opt.bg !== false) bkBg(ctx, W, H, oy);
  bkHead(ctx, W, oy, "淘汰赛赛程图 · 八强开始双败淘汰：输两场才出局");
  bkBand(ctx, 40, oy+186, 1970, 634, C_WB, "胜者组", "赢一场继续留在胜者组 · 输一场掉进败者组，还有一次机会");
  bkBand(ctx, 40, oy+838, 1970, 418, C_LB, "败者组", "从胜者组掉下来的队在这里打 · 再输一场即被淘汰");
  const geo = bkGeomDE(oy);
  bkLines(ctx, geo, T);
  T.list.forEach(m => { const g = geo[m.key]; if (g) bkCard(ctx, g, m, {}); });
  bkChampPanel(ctx, 2050, oy+186, 450, 380);
  if (opt.footer !== false){ bkLegend(ctx, W, H, oy); bkFooter(ctx, W, H, oy); }
}
function drawBkAll(ctx){
  const W = BK_VIEW.bkall.w, H = BK_VIEW.bkall.h;
  bkBg(ctx, W, H, 0);
  drawBk16(ctx, 0, { bg:false, footer:false });
  drawBkDE(ctx, BK_VIEW.bk16.h, { bg:false });
  ctx.fillStyle = rgba(C_GF, .55); ctx.fillRect(0, BK_VIEW.bk16.h, W, 3);
}
const bkExportSize = (kind, W) => { const v = BK_VIEW[kind]; return [W, Math.round(W * v.h / v.w)]; };
function bkFileName(kind){
  const tag = kind === "bk16" ? "淘汰赛_16强对阵" : (kind === "bkde" ? "淘汰赛_八强双败" : "淘汰赛_总览");
  return sanitizeName(bkTitleText()) + "_" + tag + ".png";
}
function drawBk(ctx, kind){
  if (kind === "bk16") drawBk16(ctx, 0, {});
  else if (kind === "bkde") drawBkDE(ctx, 0, {});
  else drawBkAll(ctx);
}
const BK_SHOTS = [];
function buildBkPreview(){
  const host = $("#bkPreview"); if (!host) return;
  host.innerHTML = ""; BK_SHOTS.length = 0;
  const specs = [
    { kind:"bk16",  label:"① 16 强对阵图",  sub:"分组 → 16强单败 → 八强" },
    { kind:"bkde",  label:"② 八强双败图",   sub:"胜者组 / 败者组 → 总决赛" },
    { kind:"bkall", label:"③ 总览长图",     sub:"两张合一（发公告用）" }
  ];
  specs.forEach(sp => {
    const v = BK_VIEW[sp.kind];
    const shot = document.createElement("div");
    shot.className = "shot";
    shot.innerHTML = '<div class="shot-h"><b>'+sp.label+'</b><span>'+sp.sub+'</span><button class="mini">下载 PNG</button></div>';
    const cv = makeCanvas(Math.round(v.w*0.75), Math.round(v.h*0.75));
    shot.appendChild(cv);
    host.appendChild(shot);
    shot.querySelector("button").onclick = () => downloadBracket(sp.kind);
    BK_SHOTS.push({ kind:sp.kind, canvas:cv });
  });
  renderBkPreviewArea();
}
function renderBkPreviewArea(){
  BK_SHOTS.forEach(s => {
    const v = BK_VIEW[s.kind];
    const w = Math.round(v.w*0.75), h = Math.round(v.h*0.75);
    if (s.canvas.width !== w || s.canvas.height !== h){ s.canvas.width = w; s.canvas.height = h; }
    const ctx = s.canvas.getContext("2d");
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h);
    ctx.setTransform(w/v.w, 0, 0, w/v.w, 0, 0);
    drawBk(ctx, s.kind);
  });
}
let bkTimer = null;
function scheduleBkRender(ms){
  if (!BK_SHOTS.length) return;
  clearTimeout(bkTimer);
  bkTimer = setTimeout(renderBkPreviewArea, ms === undefined ? 120 : ms);
}
function downloadBracket(kind){
  const W = Math.max(targetSize()[0], 3840);
  const [w,h] = bkExportSize(kind, W);
  const c = makeCanvas(w, h), ctx = c.getContext("2d");
  ctx.setTransform(w/BK_VIEW[kind].w, 0, 0, w/BK_VIEW[kind].w, 0, 0);
  drawBk(ctx, kind);
  c.toBlob(b => downloadBlob(b, bkFileName(kind)), "image/png");
  status("正在导出 " + w + "×" + h + " 赛程图…");
}

/* ============================================================
   十三、多局信息 & 说明
   ============================================================ */
function renderMgInfo(){
  const key = S.game ? (S.game.matchKey || "") : "";
  const rows = S.series.games.map((g, i) => ({ g, i }))
    .filter(x => (x.g.matchKey || "") === key);
  const gs = rows.map(x => x.g).filter(gameHasData);
  const winN = gs.filter(g => g.result === "win").length;
  $("#mgStat").textContent = gs.length + " 局有效数据" + (key ? " · 本场" : " · 未关联");
  $("#mgInfo").innerHTML = rows.map(({ g }) => {
    const our = S.team(g.ourId), opp = S.team(g.oppId);
    const ok = gameHasData(g);
    return '<div style="display:flex;gap:10px;align-items:center;padding:3px 0">'
      + '<b style="width:64px">'+esc(g.label)+'</b>'
      + '<span>'+esc(our.name||"—")+' <b>'+esc(g.ourScore||"-")+'</b> : <b>'+esc(g.oppScore||"-")+'</b> '+esc(opp.name||"—")+'</span>'
      + '<span class="tag '+(ok?"in":"out")+'">'+(ok?"已录入":"空")+'</span>'
      + '<span class="tag '+(g.result==="win"?"in":"out")+'">'+(g.result==="win"?"WIN":"LOSE")+'</span></div>';
    }).join("") + (gs.length ? '<div style="margin-top:6px">本场：蓝方 '+winN+' 胜 '+ (gs.length-winN) +' 负</div>' : "");
}
function renderHelp(){
  $("#helpBody").innerHTML = `
    <h3 style="margin:0 0 6px;font-size:15px">三步出图</h3>
    <div class="hint" style="line-height:2">
      1️⃣ <b>队伍库</b>：把本次系列赛的队伍一次性录入（支持批量粘贴），并给已淘汰的队打上标记；<br>
      &nbsp;&nbsp;&nbsp;&nbsp;每队点「选手名单」按 上单/打野/中路/发育路/游走 顺序录 5 人（第 6 行起是替补，下拉里带「（替补）」标记）——对局数据里的「选手」列就从这份名单里下拉选；<br>
      &nbsp;&nbsp;&nbsp;&nbsp;如果有现成的 Excel 名单（一行一名选手，含 队伍名称 / 游戏 ID / 主分路），点「📥 导入名单（Excel）」直接拖进去，队伍和 5 人名单一次导完；<br>
      2️⃣ <b>对局数据</b>：拖入赛宝战绩截图自动识别，或直接粘贴表格，再核对修改；<br>
      3️⃣ <b>多局与导出</b>：打包下载 5 张对位图 + 总览图 + 多局对比图。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">数据怎么来</h3>
    <div class="hint" style="line-height:2">
      · 赛宝<b>没有</b>面向普通赛事方的导出按钮，官方数据接口需要授权合作；<br>
      · <b>王者荣耀客户端「战绩」页也能直接认</b>：把「装备页」「数据页」两张截图一起拖进来（只给一张也行）——<br>
      &nbsp;&nbsp;&nbsp;&nbsp;KDA、总经济、输出伤害、承受伤害、各占比、参团率 都认得出，时长读左上角那处；<br>
      &nbsp;&nbsp;&nbsp;&nbsp;队名客户端不显示，工具会先按昵称在队伍库里猜一次（猜不到就手动选），比分与胜负手填；<br>
      &nbsp;&nbsp;&nbsp;&nbsp;英雄名读的是立绘左下角小字，认不全请手填，复核区会写出每格认到了什么；<br>
      · 所以本工具以「截图识别 + 手工核对」为主：识别负责省打字，核对负责保证准确；<br>
      · 数字栏位 OCR 偶尔会看错（0/8、1/7、5/6），出图前扫一眼即可。
      <br>· <b>识别出来的每一项都能改</b>：队名在本局信息里直接输入（同名切换 / 不同名就改名）、选手名在「选手」列选「✎ 手动输入 / 改名字…」、
      英雄在「英雄」列重填、比分 / 时长 / 日期 / 所有数字都直接在格子里改。
      <br>· <b>选手名会自动对名单</b>：识别完拿名字去该队「选手名单」里对，对得上就统一成名单里的写法、并按他在名单里的位置自动填「位置」列；
      对不上（赛宝昵称和名单写法不一样）就留空。
      <br>· <b>分路只是自动匹配，随你改</b>：任何选手都能放到任何分路，蓝方、红方各自选一次「位置」（互不受限），出图时按分路配对；
      懒得点就按「按顺序填分路」一键填 上单→游走 再改错的那几个。
      <br>· <b>赛宝里的 ID 不再当选手名</b>：赛宝的昵称和我们名单里的「游戏 ID」不是一回事，所以界面上的 ID / 英文串不会写进表格（只有和名单里对得上的英文名才认）。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">只填一个人的输出就够了</h3>
    <div class="hint" style="line-height:2">
      · 在「总输出万」列给<b>任意一名选手</b>填上具体输出，系统就会用他的「输出伤害%」反推<b>全队总输出</b>，
        再自动算出其他队友的总输出与「经济转伤」；<br>
      · 推算出来的数字会显示成<b>灰色小字</b>，你手填就会覆盖；也可以直接在本局信息里手填「蓝/红方总输出(万)」，以你填的为准；<br>
      · 取值优先级：手填「经济转伤」列 &gt; 该选手手填「总输出万」 &gt; 全队总输出 × 输出伤害占比。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">直播怎么用（OBS）</h3>
    <div class="hint" style="line-height:2">
      · OBS 里建 5 个<b>图片源</b>，分别指向 PKC_1_上单.png … PKC_5_游走.png；<br>
      · 每局打完点「🗂 逐个下载（固定名，OBS 用）」，同名覆盖，OBS 会自动刷新画面。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">淘汰赛赛程图</h3>
    <div class="hint" style="line-height:2">
      <b>赛制</b>：预选赛 4 个组（A/B/C/D）每组前 4 名 → 16 强；16 强赛单败淘汰，对阵<b>抽队伍</b>决定（各组第 1 名抽另一组的第 4 名、第 2 名抽第 3 名，同组不碰面）；赢下 16 强赛的 8 支队进入八强，<b>八强开始双败淘汰</b>（胜者组输一场掉进败者组，败者组再输一场才淘汰，最后总决赛）。<br>
      <b>怎么做</b>：⑤ 淘汰赛赛程图 → ① 分组下拉里从<b>队伍库</b>挑 16 支队（可以点「按队伍库自动填」先铺满再改）→ ② 把<b>你们抽签抽出来的结果填进 8 场对阵</b>（本工具不代替抽签；下拉里是队伍库全部队伍，除了本组队其它哪个组都行）→ ③ <b>点队伍名就是让它晋级</b>（再点取消，比分选填）→ ④ 导出。<br>
      <b>三张图</b>：① 16 强对阵图（含预选赛分组与对阵）、② 八强双败图（胜者组/败者组/总决赛 + 冠军）、③ 总览长图（两张合一，适合发公告）。图上每场都标着「上面这支队从哪来」，外行也能顺着线看明白。<br>
      <b>加赛</b>：<b>总决赛里败者组冠军先赢一场</b>时，双方各有一败，会出现「总决赛 · 加赛」一场，打赢的才是冠军。<br>
      <b>直播/导出</b>：在「④ 多局与导出」勾上「附带淘汰赛赛程图」，打包下载时会一起带上；逐个下载的固定名是 PKC_赛程_16强.png、PKC_赛程_八强双败.png。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">英雄图</h3>
    <div class="hint" style="line-height:2">
      · 自动扫描「英雄半身像」文件夹（当前 129 张官方半身像），按文件名第一段匹配英雄名；同一英雄有多张时在「英雄图」页点选默认；<br>
      · 出图用的是 1024px 优化图，列表用的是 320px 缩略图，都在 <b>英雄缩略图/</b>、<b>英雄优化/</b> 里自动生成；<br>
      · 换素材：把图丢进「英雄半身像」→ 点「重新扫描素材」即可；想让新图也跑得快，删掉两个缓存目录里的旧文件再跑一次 <b>04-工具\构建\build-thumbs.py</b>（可选）。
    </div>
    <div class="sep"></div>
    <h3 style="margin:0 0 6px;font-size:15px">数据存在哪</h3>
    <div class="hint" style="line-height:2">
      · 通过 启动.bat 打开时，系列赛/队伍/设置保存在 <b>02-数据\</b> 文件夹（JSON），可备份可换机；根目录 <b>数据\</b> 是兼容快捷入口；<br>
      · 直接双击网页打开时，只存在浏览器本地。
    </div>`;
}
function fillHeroDL(){
  const dl = $("#heroDL"); if (!dl) return;
  const names = HEROES ? Object.keys(HEROES.heroes).sort((a,b) => a.localeCompare(b,"zh")) : [];
  dl.innerHTML = names.map(n => '<option value="'+esc(n)+'"></option>').join("");
}

/* ============================================================
   十四、初始化
   ============================================================ */
async function loadAll(){
  const [lib, mt, pf, hp, br, ctx] = await Promise.all([
    STORE.load("library"), STORE.load("matches"), STORE.load("prefs"),
    STORE.load("heroPick"), STORE.load("bracket"), STORE.load("context")
  ]);
  DB.series = [];
  if (lib && Array.isArray(lib.series) && lib.series.length){
    DB.series = lib.series.map(s => ({ id:s.id||uid(), name:s.name||"系列赛",
      teams:(s.teams||[]).map(normTeam), games:[], current:0, bracket:emptyBracket() }));
  }
  if (!DB.series.length) DB.series = [defaultSeries()];
  const gm = (mt && mt.games) || {};
  DB.series.forEach(s => {
    const arr = gm[s.id];
    if (Array.isArray(arr) && arr.length) s.games = arr.map((g,i) => normGame(g,i));
    else if (s.games && s.games.length) s.games = s.games.map((g,i) => normGame(g,i));
    else s.games = [newGame("第1局")];
    s.bracket = normBracket(br && br[s.id]);
    s.current = 0;
  });
  if (pf) Object.assign(DB.prefs, pf);
  if (hp && typeof hp === "object") DB.heroPick = hp;
  const ctxSeries = ctx && ctx.seriesId ? DB.series.find(s => s.id === ctx.seriesId) : null;
  DB.currentId = ctxSeries ? ctxSeries.id
    : ((lib && lib.currentId && DB.series.some(s => s.id === lib.currentId)) ? lib.currentId : DB.series[0].id);
  const cur = DB.series.find(s => s.id === DB.currentId);
  if (cur && ctx){
    let i = ctx.gameId ? cur.games.findIndex(g => g.id === ctx.gameId) : -1;
    if (i < 0 && ctx.matchKey){
      const list = cur.games.map((g, k) => ({ g, k })).filter(x => (x.g.matchKey || "") === ctx.matchKey);
      if (list.length) i = list[list.length - 1].k;
    }
    if (i >= 0) cur.current = i;
  }
}
function syncPrefsForm(){
  $("#selSize").value = DB.prefs.size;
  $("#inFooter").value = DB.prefs.footer || "";
  $("#selLift").value = DB.prefs.heroLift || "auto";
  $("#swValues").checked = !!DB.prefs.values;
  $("#swOverview").checked = !!DB.prefs.overview;
  $("#swBracket").checked = !!DB.prefs.bracket;
  $("#swAllGames").checked = !!DB.prefs.allGames;
  $("#btnTheme").textContent = DB.prefs.theme === "dark" ? "🌗 浅色底图" : "🌗 深色底图";
  const styleBtn = $("#btnStyle");
  if (styleBtn) styleBtn.textContent = DB.prefs.chartStyle === "kpl" ? "🏆 KPL 风格：开" : "🏆 KPL 风格：关";
}
async function init(){
  const hasApi = await STORE.init();
  if (hasApi) {
    fetch("/api/ai-status", { cache:"no-store" })
      .then(r => r.json())
      .then(st => {
        const el = $("#aiStatus");
        if (el) el.textContent = st.configured
          ? ("DeepSeek " + st.model + " · 已连接")
          : "DeepSeek 未配置 Key";
      })
      .catch(() => { const el = $("#aiStatus"); if (el) el.textContent = "DeepSeek 状态未知"; });
  }
  await loadAll();
  if (hasApi) await loadHeroes(false);
  fillHeroDL();

  syncPrefsForm();
  renderSeriesSelect(); renderGameBar(); renderGameForm();
  renderTeamGrid(); renderTables(); renderHeroGrid(); renderHelp(); renderMgInfo();
  buildBkPreview(); renderBracket();
  buildPreview(); renderPreview();

  $$(".tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  $("#selMatch").onchange = () => {
    const key = $("#selMatch").value;
    if (key) { openMatch(key); return; }
    let idx = S.series.games.findIndex(g => !(g.matchKey || ""));
    if (idx < 0){
      S.series.games.push(newGame("第" + (S.series.games.length + 1) + "局", ""));
      idx = S.series.games.length - 1;
    }
    S.series.current = idx;
    renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); renderPreview(); renderMgInfo();
    publishContext(0); scheduleSave();
  };
  $("#btnMatchData").onclick = () => {
    const key = $("#selMatch").value;
    if (!key) return toast("先在⑤赛程图里给这场排好两支队伍");
    openMatch(key);
  };
  const clearMatchBtn = $("#btnClearMatch");
  if (clearMatchBtn) clearMatchBtn.onclick = () => {
    const key = S.game ? (S.game.matchKey || "") : "";
    if (!key) return toast("当前局没有关联赛程");
    confirmClearMatch(key);
  };

  $("#selSeries").onchange = () => { DB.currentId = $("#selSeries").value; renderMatchBar(); renderGameBar(); renderGameForm(); renderTables(); buildPreview(); renderPreview(); renderMgInfo(); renderBracket(); publishContext(0); scheduleSave(); };
  $("#btnSeriesAdd").onclick = () => {
    const n = prompt("新系列赛名称", "新系列赛");
    if (n === null) return;
    const s = newSeries(n.trim() || "新系列赛");
    DB.series.push(s); DB.currentId = s.id;
    renderSeriesSelect(); renderGameBar(); renderGameForm(); renderTeamGrid(); renderTables(); buildPreview(); renderPreview(); renderBracket(); scheduleSave();
  };
  $("#btnSeriesRen").onclick = () => {
    const n = prompt("重命名系列赛", S.series.name);
    if (n === null) return;
    S.series.name = n.trim() || S.series.name;
    renderSeriesSelect(); renderPreview(); renderBracket(); scheduleSave();
  };
  $("#btnSeriesDel").onclick = () => {
    if (DB.series.length < 2) return toast("至少要保留一个系列赛");
    if (!confirm("删除系列赛「"+S.series.name+"」及其全部对局数据？")) return;
    DB.series = DB.series.filter(s => s.id !== S.series.id);
    DB.currentId = DB.series[0].id;
    renderSeriesSelect(); renderGameBar(); renderGameForm(); renderTeamGrid(); renderTables(); buildPreview(); renderPreview(); renderBracket(); scheduleSave();
  };

  const bindGame = (sel, key, num) => {
    $(sel).oninput = () => { S.game[key] = num ? $(sel).value : $(sel).value; renderPreview(); renderMgInfo(); scheduleSave(); };
  };
  bindGame("#inOurScore", "ourScore", false);
  bindGame("#inOppScore", "oppScore", false);
  ["#inOurScore", "#inOppScore"].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener("input", () => publishContext(180));
  });
  bindGame("#inDate", "date", false);
  $("#inDur").oninput = () => { S.game.duration = $("#inDur").value; renderTables(); renderPreview(); scheduleSave(); };
  $("#inDmgBlue").oninput = () => { S.game.dmgBlue = $("#inDmgBlue").value; renderTables(); renderPreview(); scheduleSave(); };
  $("#inDmgRed").oninput  = () => { S.game.dmgRed  = $("#inDmgRed").value;  renderTables(); renderPreview(); scheduleSave(); };
  // 队伍下拉由 fillTeamSelects() 重建并绑定；改名/新建统一去 ② 队伍库。
  [["our","#btnOurTeamEdit"],["opp","#btnOppTeamEdit"]].forEach(([side, sel]) => {
    const el = $(sel);
    if (!el) return;
    el.onclick = () => {
      const id = side === "opp" ? S.game.oppId : S.game.ourId;
      const t = S.series.teams.find(x => x.id === id);
      if (!t) return toast("先在①里选一支队伍");
      switchTab("teams");
      editTeam(t);
    };
  });
  $("#selResult").onchange = () => { S.game.result = $("#selResult").value; renderPreview(); renderMgInfo(); scheduleSave(); };

  $("#teamSearch").oninput = renderTeamGrid;
  $("#teamFilter").onchange = renderTeamGrid;
  $("#btnHeroLanes").onclick = () => {
    const a = autoMatchHeroLanes("our", true), b = autoMatchHeroLanes("opp", true);
    renderTables(); renderPreview(); scheduleSave();
    toast("按英雄重新匹配分路：蓝方 " + a.laned + " 人，红方 " + b.laned + " 人"
      + ((a.missing || b.missing) ? "；有 " + (a.missing + b.missing) + " 人英雄不在映射表，请手填" : ""));
  };
  $("#btnLanes").onclick = () => {
    S.game.rows.forEach((r,i) => { r.pos = POSITIONS[i] || ""; r.posOpp = POSITIONS[i] || ""; });
    renderTables(); renderPreview(); scheduleSave();
    toast("已按 上单 → 游走 的顺序给两边填好分路，再按需单独改");
  };
  $("#btnTeamAdd").onclick = addTeam;
  $("#btnTeamBulk").onclick = () => { const b = $("#teamBulk"); b.style.display = b.style.display === "none" ? "block" : "none"; };
  $("#btnBulkGo").onclick = bulkTeams;
  $("#btnTeamImport").onclick = () => impToggle();
  const impDrop = $("#impDrop"), impFile = $("#impFile");
  impDrop.onclick = () => impFile.click();
  impFile.onchange = () => {
    if (impFile.files && impFile.files[0]) impParseFile(impFile.files[0]);
    impFile.value = "";
  };
  ["dragenter","dragover"].forEach(e => impDrop.addEventListener(e, ev => { ev.preventDefault(); impDrop.classList.add("over"); }));
  ["dragleave","drop"].forEach(e => impDrop.addEventListener(e, ev => { ev.preventDefault(); impDrop.classList.remove("over"); }));
  impDrop.addEventListener("drop", ev => {
    const f = (ev.dataTransfer.files || [])[0];
    if (f) impParseFile(f); else toast("请拖入 .xlsx / .csv 文件");
  });
  $("#impParse").onclick = () => {
    const t = $("#impPaste").value;
    if (!t.trim()) return toast("先把名单粘贴进来，或者直接把 xlsx 拖到上面");
    impParseText(t);
  };
  $("#impClear").onclick = () => { IMP.teams = null; $("#impPaste").value = ""; $("#impPreview").innerHTML = ""; };
  $("#impMode").onchange = () => { if (IMP.teams) impShow(); };

  $("#heroSearch").oninput = renderHeroGrid;
  $("#heroFilter").onchange = renderHeroGrid;
  $("#btnHeroRefresh").onclick = async () => {
    status("正在重新扫描素材…");
    IMG.length = 0;
    await loadHeroes(true);
    fillHeroDL();
    renderHeroGrid(); renderTables(); renderPreview();
    status("素材已重新扫描");
  };

  $("#btnTpl").onclick = () => {
    $("#pasteBox").value = "阵营\t位置\t选手\t英雄\t击杀\t死亡\t助攻\t总经济\t分均经济\t输出伤害\t承受伤害\t经济占比\t参团率\t经济转伤\t总输出万\n"
    + "蓝方\t上单\t选手A\t吕布\t5\t2\t7\t7911\t652\t24.5%\t19.3%\t23.0%\t76%\t-\t6.76\n"
      + "红方\t上单\t选手B\t关羽\t3\t4\t5\t6349\t615\t29.4%\t5.8%\t14.8%\t69%\t-\t10.06";
  };
  $("#btnSwap").onclick = swapSides;
  $("#btnSwapTop").onclick = swapSides;
  $("#btnParse").onclick = () => {
    const n = parseLines($("#pasteBox").value);
    const mo = autoMatchPlayers("our"), mp = autoMatchPlayers("opp");
    renderTables(); renderPreview(); scheduleSave();
    toast(n ? ("已填入 " + n + " 条" + ((mo.laned + mp.laned) ? ("，其中 " + (mo.laned + mp.laned) + " 人按队伍名单自动填了分路") : "")) : "没解析到有效行");
  };
  $("#btnFillHero").onclick = () => {
    const miss = heroMissing();
    renderHeroGrid(); renderTables(); renderPreview();
    toast(miss.length ? ("有 " + miss.length + " 个英雄没找到图：" + miss.slice(0,6).join("、")) : "全部英雄都已匹配到图片");
  };

  const fileShot = $("#fileShot"), drop = $("#drop");
  const useAI = () => !!( $("#swAiAuto") && $("#swAiAuto").checked );
  const runShots = files => useAI() ? runAIOCR(files) : runOCR(files);
  drop.onclick = () => fileShot.click();
  $("#btnAiOcr").onclick = () => {
    const files = fileShot.files && fileShot.files.length ? Array.from(fileShot.files) : [];
    if (files.length) runAIOCR(files);
    else fileShot.click();
  };
  $("#btnAiKey").onclick = async () => {
    const key = prompt("输入 DeepSeek API Key（只发送到本机服务并加密保存）");
    if (!key) return;
    try {
      const r = await fetch("/api/ai-key", {
        method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ apiKey:key }),
      });
      const out = await r.json();
      if (!r.ok || !out.ok) throw new Error(out.error || ("HTTP " + r.status));
      $("#aiStatus").textContent = "DeepSeek " + out.model + " · 已连接";
      toast("API Key 已加密保存");
    } catch (e) {
      toast("保存失败：" + e.message);
    }
  };
  fileShot.onchange = () => { if (fileShot.files && fileShot.files.length) runShots(Array.from(fileShot.files)); fileShot.value = ""; };
  ["dragenter","dragover"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave","drop"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", ev => {
    const files = Array.from(ev.dataTransfer.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length) runShots(files); else toast("请拖入图片文件");
  });

  $("#selSize").onchange = () => { DB.prefs.size = $("#selSize").value; buildPreview(); renderPreview(); scheduleSave(); };
  $("#selLift").onchange = () => {
    DB.prefs.heroLift = $("#selLift").value;
    renderHeroGrid(); renderTables(); renderPreview();
    scheduleSave();
    toast("英雄图提亮：" + $("#selLift").selectedOptions[0].textContent);
  };
  $("#inFooter").oninput = () => { DB.prefs.footer = $("#inFooter").value; scheduleRenderInput(200); scheduleSave(); };
  $("#swValues").onchange = () => { DB.prefs.values = $("#swValues").checked; renderPreview(); scheduleSave(); };
  $("#swOverview").onchange = () => { DB.prefs.overview = $("#swOverview").checked; buildPreview(); renderPreview(); scheduleSave(); };
  $("#swBracket").onchange = () => { DB.prefs.bracket = $("#swBracket").checked; scheduleSave(); toast(DB.prefs.bracket ? "导出时会把淘汰赛赛程图一起打包" : "导出时不再附带赛程图"); };
  $("#swAllGames").onchange = () => { DB.prefs.allGames = $("#swAllGames").checked; scheduleSave(); };
  $("#btnTheme").onclick = () => { DB.prefs.theme = DB.prefs.theme === "dark" ? "light" : "dark"; syncPrefsForm(); renderPreview(); scheduleSave(); };
  if ($("#btnStyle")) $("#btnStyle").onclick = () => {
    DB.prefs.chartStyle = DB.prefs.chartStyle === "kpl" ? "classic" : "kpl";
    syncPrefsForm(); renderPreview(); scheduleSave();
    toast(DB.prefs.chartStyle === "kpl" ? "已切换为 KPL 单场数据面板风格" : "已切换回经典对位图风格");
  };
  $("#btnZip").onclick = () => exportZip(DB.prefs.allGames);
  $("#btnZip2").onclick = () => exportZip($("#swAllGames").checked);
  $("#btnEach").onclick = () => downloadFixed($("#swAllGames").checked);
  $("#btnMgDown").onclick = downloadMulti;

  /* ---- ⑤ 淘汰赛赛程图 ---- */
  $("#bkTitle").oninput = () => { B().title = $("#bkTitle").value; scheduleBkRender(220); scheduleSave(); publishBracketLive({ kind:"meta" }, 220); };
  $("#bkShort").oninput = () => { B().short = $("#bkShort").value; scheduleBkRender(220); scheduleSave(); publishBracketLive({ kind:"meta" }, 220); };
  $("#bkNote").oninput  = () => { B().note  = $("#bkNote").value;  scheduleBkRender(220); scheduleSave(); publishBracketLive({ kind:"meta" }, 220); };
  $("#bkDrawClear").onclick = () => {
    const b = B();
    if (Object.keys(b.win || {}).length && !confirm("清空对阵会同时清掉赛果，继续？")) return;
    b.draw = BK_R16_TYPE.map(() => ({ a:"", b:"" })); b.win = {}; b.score = {};
    renderBkDraw(); renderBkMatches(); scheduleBkRender(); scheduleSave();
    publishBracketLive({ kind:"bulk" });
  };
  $("#bkFill").onclick = bkAutoFill;
  $("#bkClearTeams").onclick = () => {
    const b = B();
    BK_G.forEach(g => { b.groups[g] = ["","","",""]; });
    renderBracket(); scheduleSave();
    publishBracketLive({ kind:"bulk" });
  };
  $("#bkResetAll").onclick = () => {
    if (!confirm("清空全部赛果（比分和晋级）？分组会保留。")) return;
    B().win = {}; B().score = {};
    renderBkMatches(); scheduleBkRender(); scheduleSave();
    publishBracketLive({ kind:"meta" });
    toast("已清空赛果");
  };
  $("#bkDown16").onclick = () => downloadBracket("bk16");
  $("#bkDownDE").onclick = () => downloadBracket("bkde");
  $("#bkDownAll").onclick = () => downloadBracket("bkall");
  $("#bkText").onclick = bkCopyText;
  $$("[data-bk-jump]").forEach(b => {
    b.onclick = () => {
      const el = $("#" + b.dataset.bkJump);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  if (!hasApi){
    status("本地服务未启动：截图识别 / 英雄图 / 队伍库保存不可用", true);
    toast("建议双击 启动.bat 打开，功能才完整");
  } else {
    status("就绪 · 英雄图 " + (HEROES ? Object.keys(HEROES.heroes).length : 0) + " 个");
  }

  const pvBtn = $("#btnPreviewToggle");
  const layoutEl = document.querySelector(".layout");
  if (pvBtn && layoutEl){
    const syncPv = () => {
      const hidden = layoutEl.classList.contains("focus");
      pvBtn.textContent = hidden ? "👁 显示预览" : "👁 收起预览";
      pvBtn.classList.toggle("primary", hidden);
    };
    pvBtn.onclick = () => { layoutEl.classList.toggle("focus"); syncPv(); };
    syncPv();
  }
  const tabParam = new URLSearchParams(location.search).get("tab");
  if (tabParam && document.getElementById("panel-" + tabParam)) switchTab(tabParam);

  publishContext(0);

  window.PKC = {
    db: () => DB, heroes: () => HEROES, series: () => S.series, game: () => S.game,
    render: () => { renderTables(); buildPreview(); renderPreview(); },
    normGame, newGame, contextSnapshot, publishContext,
    bkMatchList, bkMatchByKey, bkSelectableMatches, gamesOfMatch, openMatch,
    renderMatchBar, renderGameBar, renderGameForm, renderBracket, matchTeamMismatch, matchRecord, bkLinkIssues,
    teamGroupOf, bkTeamStatus, bkTeamMatchKey, syncTeamGroups,
    multiGames, gamesForExport,
    parseLines, heroCandidates, heroPickRec, exportList, chartItems, drawExport, drawMulti,
    switchTab, showCands, focusHero, runOCR, runAIOCR, swapSides, save: saveAll, lanePair,
    bracket: B, bkTree, bkR16Pairs, bkChampion, drawBk, drawBk16, drawBkDE, drawBkAll,
    bkDrawIssues, bkTeamSeed,
    impParseRows, impTextToRows, impReadXlsx, impZipEntries, impParseText, impApply, impTeams: () => IMP.teams,
    autoMatchPlayers, autoMatchHeroLanes, normPlayerName, joinName,
    wordsFromTSV, clusterRows, splitLanes, pageSizeFromTSV, rowToLine, parseSaibaoBlocks, effRow,
    matchHeroIcon, loadIconFeatures,
    ocrDebug: () => ocrDebug, clientDebug: () => clientDebug,
    parseClientPage, looksLikeClient, snapHeroName, clientRowGrid, cliOcrCells
  };
}
if (document.getElementById("selSeries")) {
  document.addEventListener("DOMContentLoaded", init);
}
