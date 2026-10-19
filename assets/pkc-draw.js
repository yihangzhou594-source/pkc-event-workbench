/* ============================================================
   PKC · 03 · 绘制与预览
   对位图 / 总览图的画布绘制、主题、预览缩放。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
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
  renderIssues();
  status("已刷新 · " + Math.round(performance.now()-t0) + "ms");
}
