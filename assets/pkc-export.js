/* ============================================================
   PKC · 06 · 导出 / 淘汰赛赛程
   多局对比、打包下载、淘汰赛模型与赛程图绘制、清除某场数据。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
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
  else if (item.kind === "bigMatch") drawBigMatchSummary(ctx);
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
  const summary = bigMatchSummary();
  if (summary.games){
    const c = drawExport({ kind:"bigMatch" }, W, H);
    files.push({
      name: sanitizeName([
        (summary.blue.name || "蓝方") + "_vs_" + (summary.red.name || "红方"),
        S.series.name,
        "大场数据汇总",
      ].filter(Boolean).join("_")) + ".png",
      data: await canvasBytes(c),
    });
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
function downloadBigMatch(){
  const summary = bigMatchSummary();
  if (!summary.games) return toast("当前大场还没有可汇总的有效局数据");
  const [W,H] = targetSize();
  const c = drawExport({ kind:"bigMatch" }, W, H);
  const name = sanitizeName([
    (summary.blue.name || "蓝方") + "_vs_" + (summary.red.name || "红方"),
    S.series.name,
    "大场数据汇总",
  ].filter(Boolean).join("_")) + ".png";
  c.toBlob(b => downloadBlob(b, name), "image/png");
  status("正在导出大场数据汇总图…");
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
  return '<option value="">（未选）</option>' + list
    .filter(t => (!t.eliminated && bkTeamStatus(t.id).state !== "out") || t.id === cur)
    .map(t => '<option value="'+t.id+'"'+(t.id === cur ? " selected" : "")
      + ((!t.eliminated && bkTeamStatus(t.id).state !== "out") ? "" : " disabled")+'>'
      + esc(((teamGroupOf(t.id)||t.group) ? (teamGroupOf(t.id)||t.group) + " · " : "") + (t.name || "（没有名字）"))
      + (t.eliminated ? "（已停用）" : (bkTeamStatus(t.id).state === "out" ? "（已淘汰）" : "")) + '</option>').join("");
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
  bindFieldLabels();
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
  return '<option value="">（未选）</option>' + list
    .filter(t => (!t.eliminated && bkTeamStatus(t.id).state !== "out") || t.id === cur)
    .map(t => {
    const s = bkTeamSeed(t.id);
    const tag = s ? (s + " · ") : "";
    const dup = (used[t.id] > 1 && t.id !== cur) ? "（已排在别处）" : "";
    const unavailable = t.eliminated || bkTeamStatus(t.id).state === "out";
    return '<option value="'+t.id+'"'+(t.id === cur ? " selected" : "")+(unavailable ? " disabled" : "")+'>'
      + esc(tag + (t.name || "（没有名字）") + (t.eliminated ? "（已停用）" : (unavailable ? "（已淘汰）" : "")) + dup) + '</option>';
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
  window.PKC_RECOVERY?.snapshotBeforeChange(
    "clear-match",
    ["matches", "bracket"],
    "清除 " + snapshot.name + " 的 " + snapshot.games.length + " 局",
  );

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
      const previous = { win: b2.win[k] || null, score: b2.score[k] ? { ...b2.score[k] } : null };
      window.PKC_RECOVERY?.snapshotBeforeChange("clear-match-score", ["bracket"], "清空 " + matchDisplayName(k));
      delete b2.win[k]; delete b2.score[k];
      renderBkMatches(); scheduleSave(); scheduleBkRender();
      publishBracketLive({ kind:"meta" });
      showUndoBar("已清空「" + matchDisplayName(k) + "」的比分和晋级", () => {
        const next = B();
        if (previous.score) next.score[k] = previous.score;
        else delete next.score[k];
        if (previous.win) next.win[k] = previous.win;
        else delete next.win[k];
        renderBkMatches(); scheduleSave(); scheduleBkRender(); publishBracketLive({ kind:"meta" });
        toast("已撤销，比分和晋级已恢复");
      });
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
