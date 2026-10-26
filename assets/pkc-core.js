/* ============================================================
   PKC · 01 · 数据模型 / 存储 / 英雄索引
   系列赛与对局的数据结构、本地/服务端存储、跨页上下文、英雄图索引。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
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
  const rawLanes = Array.isArray(t.playerLanes) ? t.playerLanes.slice(0, 12) : [];
  const rawMeta = Array.isArray(t.playerMeta) ? t.playerMeta.slice(0, 12) : [];
  const laneOf = v => {
    const s = String(v == null ? "" : v).trim();
    return s === "对抗路" ? "上单" : s;
  };
  const lanes = src.map((_, i) => laneOf(rawLanes[i]) || (i < 5 ? POSITIONS[i] : ""));
  return { id:t.id||uid(), name:t.name||"", color:t.color||PALETTE[0],
           eliminated:!!t.eliminated, note:t.note||"", group:t.group||"",
           players:src, playerLanes:lanes, logo:String(t.logo||""),
           playerMeta:src.map((_, i) => ({ realName:String(rawMeta[i] && rawMeta[i].realName || ""), lane:lanes[i] })) };
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
   二、服务端存储（不可用时停止写入，不创建第二份浏览器数据）
   ============================================================ */
/* 多标签页保护：每个 key 记住服务端内容哈希，保存时带上；冲突就停下并提示。 */
const STORE_REV = new Map();
const STORE_CONFLICT_KEYS = new Set(["library", "matches", "bracket", "heroPick"]);
const STORE_QUEUES = new Map();
let contextRevision = 0;
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

function showStoreUnavailable(){
  if (document.getElementById("pkcStoreUnavailable")) return;
  const el = document.createElement("div");
  el.id = "pkcStoreUnavailable";
  el.className = "pkc-conflict";
  const span = document.createElement("span");
  span.textContent = "本地服务未连接，数据没有保存。请重新连接服务后重试。";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "重试连接";
  btn.onclick = () => location.reload();
  el.append(span, btn);
  document.body.appendChild(el);
}

const LEGACY_STORAGE_KEYS = ["library", "matches", "prefs", "heroPick", "bracket", "context"];
function readLegacyStorage(){
  const out = {};
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem("pkc2_" + key);
      if (raw) {
        const value = JSON.parse(raw);
        if (value !== null) out[key] = value;
      }
    } catch(e) { /* malformed legacy values stay untouched */ }
  }
  return out;
}
function showLegacyStorageNotice(){
  const legacy = readLegacyStorage();
  const keys = Object.keys(legacy);
  if (!keys.length || document.getElementById("pkcLegacyStorageNotice")) return;
  const el = document.createElement("div");
  el.id = "pkcLegacyStorageNotice";
  el.className = "pkc-conflict";
  const text = document.createElement("span");
  text.textContent = "发现旧浏览器数据（" + keys.length + " 项），尚未导入服务器。";
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "预览差异";
  preview.onclick = () => openLegacyStoragePreview(legacy);
  el.append(text, preview);
  document.body.appendChild(el);
}
async function openLegacyStoragePreview(legacy){
  let panel = document.getElementById("pkcLegacyStoragePanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "pkcLegacyStoragePanel";
    panel.style.cssText = "position:fixed;z-index:10001;top:68px;left:50%;transform:translateX(-50%);width:min(760px,94vw);max-height:76vh;overflow:auto;padding:16px;border:1px solid #cbd4e0;border-radius:14px;background:#fff;color:#243044;box-shadow:0 18px 50px rgba(20,30,45,.25);font:13px system-ui";
    document.body.appendChild(panel);
  }
  panel.replaceChildren();
  const title = document.createElement("b");
  title.textContent = "旧浏览器数据迁移预览";
  panel.appendChild(title);
  const note = document.createElement("p");
  note.textContent = "逐项选择保留服务器数据或采用浏览器旧数据。预览不会写入；导入会对所选项逐项备份并保存。";
  panel.appendChild(note);
  const rows = document.createElement("div");
  panel.appendChild(rows);
  const choices = new Map();
  for (const key of LEGACY_STORAGE_KEYS) {
    if (!(key in legacy)) continue;
    const serverResponse = await fetch("/api/store/" + key, { cache:"no-store" });
    const serverRev = serverResponse.headers.get("X-PKC-Rev");
    if (serverRev) STORE_REV.set(key, serverRev);
    const current = serverResponse.ok ? await serverResponse.json().catch(() => null) : null;
    const same = JSON.stringify(current) === JSON.stringify(legacy[key]);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e6eaf0";
    const label = document.createElement("span");
    label.style.cssText = "flex:1";
    label.textContent = key + (same ? " · 内容一致" : " · 与服务器内容不同");
    const select = document.createElement("select");
    select.style.cssText = "width:180px;padding:6px;border:1px solid #cbd4e0;border-radius:7px";
    select.append(new Option("保留服务器", "server"), new Option("采用浏览器旧数据", "browser"));
    choices.set(key, select);
    row.append(label, select);
    rows.appendChild(row);
  }
  const status = document.createElement("div");
  status.style.cssText = "margin:8px 0;color:#8b3f28";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
  const close = document.createElement("button");
  close.textContent = "关闭";
  close.onclick = () => panel.remove();
  const apply = document.createElement("button");
  apply.textContent = "导入所选旧数据";
  apply.style.cssText = "border:0;border-radius:8px;padding:7px 11px;background:#ffd76a;color:#3a2b05;font-weight:700;cursor:pointer";
  apply.onclick = async () => {
    const selected = [...choices].filter(([, select]) => select.value === "browser").map(([key]) => key);
    if (!selected.length) { status.textContent = "没有选择要导入的旧数据。"; return; }
    apply.disabled = true;
    try {
      for (const key of selected) {
        if (key === "context") {
          const currentResponse = await fetch("/api/competition/context", { cache:"no-store" });
          const currentState = await currentResponse.json().catch(() => ({}));
          if (!currentResponse.ok) throw new Error("context：无法读取当前 revision");
          contextRevision = Number(currentState.revision) || 0;
          const response = await fetch("/api/competition/context", {
            method:"POST", headers:{ "Content-Type":"application/json" },
            body:JSON.stringify({ context:legacy[key], revision:contextRevision }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(key + "：" + (result.message || result.error || response.status));
          contextRevision = Number(result.revision) || contextRevision;
        } else if (!await STORE.save(key, legacy[key])) {
          throw new Error(key + "：服务端未接受写入");
        }
      }
      status.textContent = "导入完成，正在重新读取服务器数据…";
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      status.textContent = "导入未全部完成：" + error.message + "。已成功的项目保留在服务器，可重新预览。";
      apply.disabled = false;
    }
  };
  actions.append(close, apply);
  panel.append(status, actions);
}

const STORE = {
  mode: "unavailable",
  async init(){
    try {
      const r = await fetch("/api/ping", { cache:"no-store" });
      if (r.ok){ this.mode = "api"; showLegacyStorageNotice(); return true; }
    } catch(e){}
    this.mode = "unavailable";
    showStoreUnavailable();
    return false;
  },
  async load(key){
    if (this.mode === "api"){
      try {
        const r = await fetch("/api/store/"+key, {cache:"no-store"});
        if (!r.ok) { showStoreUnavailable(); return null; }
        const rev = r.headers.get("X-PKC-Rev");
        if (rev) STORE_REV.set(key, rev);
        return await r.json();
      } catch(e){ showStoreUnavailable(); return null; }
    }
    return null;
  },
  async save(key, data){
    const previous = STORE_QUEUES.get(key) || Promise.resolve(true);
    const task = previous.catch(() => false).then(async () => {
      if (this.mode !== "api") { showStoreUnavailable(); return false; }
      if (storeWriteBlocked) return false;
      try {
        const headers = { "Content-Type":"application/json" };
        const base = STORE_REV.get(key);
        if (STORE_CONFLICT_KEYS.has(key) && base) headers["X-PKC-Base-Rev"] = base;
        const r = await fetch("/api/store/"+key, { method:"POST", headers, body:JSON.stringify(data) });
        const result = await r.json().catch(() => ({}));
        if (r.status === 409){ showStoreConflict(); return false; }
        if (!r.ok) throw new Error(result.message || result.error || ("HTTP " + r.status));
        const rev = r.headers.get("X-PKC-Rev");
        if (rev) STORE_REV.set(key, rev);
        return true;
      }
      catch(e){ console.warn("保存失败", key, e); showStoreUnavailable(); return false; }
    });
    STORE_QUEUES.set(key, task);
    return task;
  }
};

let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 500);
}
async function saveCoreData(){
  if (storeWriteBlocked || STORE.mode !== "api") return false;
  const librarySaved = await STORE.save("library", {
    currentId: DB.currentId,
    series: DB.series.map(s => ({ id:s.id, name:s.name, teams:s.teams }))
  });
  const games = {};
  DB.series.forEach(s => { games[s.id] = s.games; });
  const matchesSaved = await STORE.save("matches", { games });
  const brackets = {};
  DB.series.forEach(s => { brackets[s.id] = s.bracket || emptyBracket(); });
  const bracketSaved = await STORE.save("bracket", brackets);
  return librarySaved && matchesSaved && bracketSaved;
}
async function saveAll(){
  if (!await saveCoreData()) return false;
  const prefsSaved = await STORE.save("prefs", DB.prefs);
  const heroSaved = await STORE.save("heroPick", DB.heroPick);
  const saved = prefsSaved && heroSaved;
  if (saved && window.parent !== window) {
    try { window.parent.postMessage({ type:"pkc:data-saved" }, location.origin); } catch {}
  }
  return saved;
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
let pendingContext = null;
let contextRequestBusy = false;
let contextConflictPending = false;
function showContextStatus(message, actions){
  let el = document.getElementById("pkcContextStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "pkcContextStatus";
    el.className = "pkc-conflict";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "assertive");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }
  el.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  (actions || []).forEach(({ label, run }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.onclick = run;
    el.appendChild(btn);
  });
}
function submitPendingContext(){
  if (contextRequestBusy || !pendingContext) return;
  const context = pendingContext;
  contextRequestBusy = true;
  fetch("/api/competition/context", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ context, revision:contextRevision }),
  }).then(async response => {
    const result = await response.json().catch(() => ({}));
    if (response.status === 409) {
      contextConflictPending = true;
      showContextStatus("当前场次已被其他页面更新。", [
        { label:"采用最新场次", run:() => location.reload() },
        { label:"继续使用此页选择", run:() => { contextRevision = Number(result.revision) || 0; contextConflictPending = false; submitPendingContext(); } },
      ]);
      return;
    }
    if (!response.ok) throw new Error(result.message || result.error || ("HTTP " + response.status));
    contextRevision = Number(result.revision) || contextRevision;
    if (pendingContext === context) pendingContext = null;
    contextConflictPending = false;
    const status = document.getElementById("pkcContextStatus");
    if (status) status.remove();
  }).catch(error => {
    showContextStatus("当前场次没有同步成功：" + error.message, [
      { label:"重试", run:() => submitPendingContext() },
    ]);
  }).finally(() => {
    contextRequestBusy = false;
    if (pendingContext && !contextConflictPending) submitPendingContext();
  });
}
function publishContext(delay){
  clearTimeout(ctxTimer);
  const send = async () => {
    const ctx = contextSnapshot();
    if (!ctx) return;
    if (STORE.mode !== "api") return showStoreUnavailable();
    if (!await saveCoreData()) {
      showContextStatus("场次尚未同步：赛事数据保存失败。", [
        { label:"重试", run:() => publishContext(0) },
      ]);
      return;
    }
    pendingContext = ctx;
    submitPendingContext();
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
