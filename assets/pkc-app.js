/* ============================================================
   PKC · 07 · 多局信息 / 说明 / 初始化
   多局统计、帮助文案、事件绑定与启动。
   （由 chart-core.js 拆分而来；加载顺序 01 → 07，共享同一全局作用域）
   ============================================================ */
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

/** 把 .fld 里的 label 和控件绑起来：键盘 Tab / 读屏软件能念出字段名。 */
let fldSeq = 0;
function bindFieldLabels(root){
  $$(".fld", root || document).forEach(f => {
    const lab = f.querySelector("label");
    const ctl = f.querySelector("input, select, textarea");
    if (!lab || !ctl) return;
    if (!ctl.id) ctl.id = "pkc-fld-" + (++fldSeq);
    if (lab.htmlFor !== ctl.id) lab.htmlFor = ctl.id;
  });
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
