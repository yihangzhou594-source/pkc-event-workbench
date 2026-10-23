/* ============================================================
   PKC · 05 · 截图识别
   本地 Tesseract 与 DeepSeek 视觉识别、结果合并与语义校验。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
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
  if (n && typeof collapseImportToolsAfterSuccess === "function") {
    collapseImportToolsAfterSuccess("识别完成 · 已填入 " + n + " 组，核对下方结果");
  }
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
  if (typeof collapseImportToolsAfterSuccess === "function") {
    collapseImportToolsAfterSuccess("AI 识别完成 · 核对下方结果");
  }
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
  window.PKC_RECOVERY?.snapshotBeforeChange("swap-sides", ["matches"], "交换当前局红蓝方");
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
