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
    <div class="hp" id="hp-top">
      <div class="hp-hero">
        <div class="hp-hero-main">
          <div class="hp-eyebrow">PKC 赛事工作台 · 操作手册</div>
          <h2>从建队伍到直播出图</h2>
          <p>按「队伍库 → 对局数据 → 多局与导出」走一遍就能出图。第一次用，先看下面的 30 秒上手；遇到问题直接搜关键词。</p>
          <div class="hp-meta"><span>更新：2026-10-19</span><span>适用：本地工作台 / OBS 浏览器源</span></div>
        </div>
        <div class="hp-actions">
          <button class="hp-action" data-help-tab="teams"><span class="hp-action-k">①</span><b>建队伍</b><em>队名 · 名单 · 替补</em></button>
          <button class="hp-action" data-help-tab="data"><span class="hp-action-k">②</span><b>录一局</b><em>截图识别 · 核对数据</em></button>
          <button class="hp-action" data-help-tab="bracket"><span class="hp-action-k">③</span><b>排赛程</b><em>分组 · 抽签 · 晋级</em></button>
          <button class="hp-action" data-help-tab="out"><span class="hp-action-k">④</span><b>出图</b><em>打包 · OBS 固定名</em></button>
        </div>
      </div>

      <div class="hp-tools">
        <label class="hp-search"><span>🔍</span><input id="helpSearch" type="search" placeholder="搜索：OBS、名单、OCR、赛程、备份……" autocomplete="off" /></label>
        <span class="hp-count" id="helpCount"></span>
        <a class="hp-manual" href="/使用说明.md" target="_blank" rel="noopener">完整文字手册 ↗</a>
      </div>

      <nav class="hp-toc" aria-label="说明目录">
        <button data-goto="hp-start">30 秒上手</button>
        <button data-goto="hp-teams">队伍库</button>
        <button data-goto="hp-game">对局数据</button>
        <button data-goto="hp-export">导出</button>
        <button data-goto="hp-live">直播 / OBS</button>
        <button data-goto="hp-bracket">淘汰赛赛程</button>
        <button data-goto="hp-sync">赛程联动</button>
        <button data-goto="hp-hero">英雄图</button>
        <button data-goto="hp-files">数据与文件</button>
        <button data-goto="hp-faq">常见问题</button>
        <button data-goto="hp-limits">已知限制</button>
      </nav>

      <div id="helpEmpty" class="hp-empty" hidden>没有匹配的内容，换个关键词试试。</div>

      <details class="hp-sec" id="hp-start" open data-keywords="开始 上手 启动 流程 顺序 30秒">
        <summary><span class="hp-num">0</span><b>30 秒上手</b><em>第一次用先看这里</em></summary>
        <div class="hp-body">
          <div class="hp-steps">
            <div class="hp-step"><i>1</i><div><b>启动服务</b><p>双击 <code>启动.bat</code>，浏览器打开 <code>http://localhost:8971</code>。黑色命令行窗口是服务本体，关掉就停服；不要直接双击 <code>PKC赛后数据图生成器.html</code>。</p></div></div>
            <div class="hp-step"><i>2</i><div><b>建队伍</b><p>左侧「队伍库」→ 批量粘贴 <code>队名,主色</code>，或「📥 导入名单（Excel）」；点「选手名单」补齐 5 人，第 6 行起算替补。</p></div></div>
            <div class="hp-step"><i>3</i><div><b>录一局</b><p>左侧「对局数据」→ 拖入赛宝或客户端截图，或粘贴表格；核对队名、选手、英雄、分路、比分和时长。</p></div></div>
            <div class="hp-step"><i>4</i><div><b>出图</b><p>左侧「多局与导出」→「打包下载（ZIP）」；直播用「逐个下载（固定名，OBS 用）」，同名覆盖自动刷新。</p></div></div>
          </div>
          <div class="hp-note"><b>两条线别混：</b>赛后数据图走「队伍库 → 对局数据 → 导出」；淘汰赛赛程图走「赛程 → 分组 / 抽签 / 晋级 → 导出」，再从赛程点「📊 录数据」把某一局接进对局数据。</div>
        </div>
      </details>

      <details class="hp-sec" id="hp-teams" data-keywords="队伍库 名单 选手 替补 excel 导入 队名 主色 淘汰">
        <summary><span class="hp-num">1</span><b>开赛前：队伍库与名单</b><em>一个系列赛只做一次</em></summary>
        <div class="hp-body">
          <h4>队伍库里有什么</h4>
          <ul>
            <li><b>队名 + 主色 + 选手名单</b>三项，按系列赛分开保存；主色只影响列表上的小圆点，不影响数据图配色。</li>
            <li>「批量粘贴名单」每行一支：<code>队名,主色</code>，主色可省略。</li>
            <li>「选手名单」按 <b>上单 / 打野 / 中路 / 发育路 / 游走</b> 顺序粘贴；第 6 行起是替补，下拉里带「（替补）」，一队最多 12 人。</li>
            <li>「标记淘汰」只改列表状态，方便一眼看出剩余队伍，不会删数据。</li>
          </ul>
          <h4>导入 Excel 名单</h4>
          <p>赛前那张「全体参赛成员名单」可直接拖进「📥 导入名单（Excel）」，也可以在 Excel 里框选后 Ctrl+C 粘到输入框。工具会自动找表头，按「队伍名称」聚合，用「主分路」排进五个位置。</p>
          <ul>
            <li>预览会列出：识别到几队几人、哪些是新建 / 同名、每队五个位置是谁、超过 5 人时谁是替补、哪些位置靠补位。</li>
            <li>同名队伍可选 <b>覆盖名单 / 只补空缺 / 跳过</b>；导入只动队伍库，不碰对局数据和赛程。</li>
            <li>表里的「小组」会记在队伍上，赛程分组下拉和队伍搜索都能用。</li>
          </ul>
          <div class="hp-note"><b>选手下拉是空的？</b>说明这支队还没填名单。回「队伍库」→ 点队伍卡片「选手名单」补 5 人并保存。</div>
        </div>
      </details>

      <details class="hp-sec" id="hp-game" data-keywords="对局数据 识别 ocr ai 赛宝 客户端 战绩 截图 粘贴 kda 经济 输出 承伤 分路 选手 英雄">
        <summary><span class="hp-num">2</span><b>录一局：截图识别与核对</b><em>识别负责省打字，核对负责准确</em></summary>
        <div class="hp-body">
          <p>赛宝没有面向普通赛事方的一键导出，官方数据接口需要授权合作；所以本工具走「截图识别 + 人工核对」：识别负责省打字，核对负责保证准确。</p>
          <h4>三种录入方式</h4>
          <table class="hp-table">
            <thead><tr><th>来源</th><th>怎么给</th><th>能认什么</th><th>要注意</th></tr></thead>
            <tbody>
              <tr><td><b>赛宝「数据」页</b></td><td>截图拖进「对局数据」</td><td>选手名、KDA、总经济、输出 / 承伤 / 经济占比、参团率、顶部对阵与胜负</td><td>默认走 DeepSeek；数字要扫一眼</td></tr>
              <tr><td><b>客户端「战绩」页</b></td><td>装备页 + 数据页两张一起拖，或只给一张</td><td>KDA、总经济、输出、承伤、各占比、参团率、对局时长</td><td>队名客户端不显示，要手动确认；英雄名认不全</td></tr>
              <tr><td><b>手动粘贴</b></td><td>从 Excel 或任何地方整块复制</td><td>全部列</td><td>列按位置对齐，空位写 <code>-</code></td></tr>
            </tbody>
          </table>
          <div class="hp-note"><b>手动粘贴列顺序：</b><code>位置 选手 英雄 击杀 死亡 助攻 总经济 分均经济 输出伤害 承受伤害 经济占比 参团率 经济转伤 总输出万</code>。可加「我方 / 对方」前缀，<code>5/2/7</code> 这种合并 KDA 也能识别；中间空着的位置写 <code>-</code>，否则后面的数字会往前串一格。点「插入表头模板」可看完整列顺序。</div>
          <div class="hp-note"><b>关于 AI：</b>拖图后默认调用 DeepSeek <code>deepseek-flash</code>，截图会发送到 DeepSeek API；Key 只保存在本机 <code>数据\\ai-config.json</code>（Windows DPAPI 加密），不会下发到浏览器。不想用 AI 就取消「拖图后自动用 AI」，或点「用 DeepSeek 识别」手动触发；本地 Tesseract 作为失败时的兜底。</div>

          <h4>识别完先核对这 7 项</h4>
          <ol>
            <li><b>队名</b>：本局信息里直接改；和队伍库某队完全一样就切换，否则改当前队名并同步到队伍库。</li>
            <li><b>选手</b>：从下拉选；名单外名字会标「（不在名单）」，可在下拉最后选「✎ 手动输入 / 改名字…」。</li>
            <li><b>英雄</b>：直接在「英雄」列重填，有下拉提示，图会跟着换。</li>
            <li><b>位置</b>：按名单 / 英雄自动匹配，最终以你选的分路为准；蓝方、红方各 5 行互不影响。</li>
            <li><b>比分 / 胜负</b>：本局信息里改；「⇄ 交换红蓝」可整体互换。</li>
            <li><b>时长</b>：用 <code>12:11</code> 这种格式，分均经济会自动算。</li>
            <li><b>数字</b>：OCR 偶尔把 <code>28.1%</code> 认成 <code>2.11</code>、<code>0/8</code> 认成 <code>1/7</code>，逐格扫一眼。</li>
          </ol>
          <div class="hp-note"><b>选手名会自动对名单：</b>识别完会拿名字去该队「选手名单」里对，对得上就统一成名单里的写法，并按名单里的位置自动填「位置」列；对不上（赛宝昵称和名单写法不一样）就留空，等你手填。</div>

          <h4>分路怎么配对</h4>
          <p>出图时按分路配对：某条路的对位图 = 蓝方标了这条路的人 vs 红方标了这条路的人。分路只是自动匹配，随时可改。</p>
          <ul>
            <li>「按英雄分路」按双方英雄重新匹配，会覆盖当前分路。</li>
            <li>「按顺序填分路」按 上单 → 打野 → 中路 → 发育路 → 游走 一次填满两边，再改错的。</li>
            <li>卡片副标题会显示「蓝方 5/5 · 红方 5/5 已指定」，缺谁、重复谁都会写出来。</li>
          </ul>

          <h4>只填一个人的输出就够了</h4>
          <p>在「总输出万」列给<b>任意一名选手</b>填具体输出，系统会用他的「输出伤害%」反推<b>全队总输出</b>，再自动算其他队友的总输出和经济转伤。推算值显示成灰色小字，手填会覆盖。</p>
          <p>取值优先级：手填「经济转伤」列 &gt; 该选手手填「总输出万」 &gt; 全队总输出 × 输出伤害占比。</p>
        </div>
      </details>

      <details class="hp-sec" id="hp-export" data-keywords="导出 打包 zip 下载 文件名 固定名 多局 总览 对比 尺寸 深色 浅色 kpl">
        <summary><span class="hp-num">3</span><b>出图与导出</b><em>7 张图怎么拿</em></summary>
        <div class="hp-body">
          <h4>会出哪些图</h4>
          <p>一局默认 <b>5 张对位图</b>（上单 / 打野 / 中路 / 发育路 / 游走）+ <b>1 张五路总览</b>；多局再附 <b>1 张多局对比</b>。勾「附带淘汰赛赛程图」会多两张赛程图。</p>
          <table class="hp-table">
            <thead><tr><th>方式</th><th>文件名</th><th>适合</th></tr></thead>
            <tbody>
              <tr><td>打包下载（ZIP）</td><td><code>系列赛_第1局_赛后数据图.zip</code></td><td>存档、发群、整包交付</td></tr>
              <tr><td>逐个下载（固定名）</td><td>单局：<code>PKC_1_上单.png</code> … <code>PKC_5_游走.png</code>、<code>PKC_总览.png</code>、<code>PKC_多局对比.png</code></td><td>OBS 图片源，同名覆盖自动刷新</td></tr>
              <tr><td>赛程图</td><td><code>PKC_赛程_16强.png</code>、<code>PKC_赛程_八强双败.png</code></td><td>赛程图源 / 发公告</td></tr>
            </tbody>
          </table>
          <h4>图上的七个维度</h4>
          <p>雷达固定七维（顺时针，从正上方开始）：<b>KDA / 击杀 / 伤害 / 承伤占比 / 分均经济 / 参团率 / 经济转伤</b>。雷达每项以双方较高值为 100%，用于看相对形状；旁边同时标出真实值，伤害与经济末尾统一用 k。全图统一按赛制配色——蓝方一路鲜蓝、红方一路鲜红。</p>
          <p>顶部「🏆 KPL 风格」会切到单场电竞数据面板版式：蓝红比分条、左右英雄卡、中央双向雷达、选手数据卡和底部对比条。只使用现有字段，不编造补刀数、团战伤害等没有的数据。</p>
          <ul>
            <li>多局导出时，对位图序号会变成 <code>PKC_1_…</code>、<code>PKC_2_…</code>，按局依次排。</li>
            <li>「导出包含本场所有局」只取当前场次的局；多局对比、逐张下载和 ZIP 都不会跨场拼接。</li>
            <li>右侧预览可点右上角「收起预览」，对位表 14 列能一屏放下；尺寸、深色 / 浅色底图、KPL 风格、英雄图提亮都在「多局与导出」里调。</li>
          </ul>
        </div>
      </details>

      <details class="hp-sec" id="hp-live" data-keywords="obs 直播 导播台 浏览器源 解说 赛间 赛程图 数据图 轮播 快捷键 1920 1080">
        <summary><span class="hp-num">4</span><b>直播：OBS 与导播台</b><em>浏览器源 + 现场操作</em></summary>
        <div class="hp-body">
          <h4>OBS 浏览器源地址</h4>
          <table class="hp-table hp-obs">
            <thead><tr><th>画面</th><th>地址</th><th></th></tr></thead>
            <tbody>
              <tr><td>解说演播厅</td><td><code>http://localhost:8971/obs/commentary</code></td><td><button class="hp-copy" data-copy="http://localhost:8971/obs/commentary">复制</button></td></tr>
              <tr><td>赛间板</td><td><code>http://localhost:8971/obs/interval</code></td><td><button class="hp-copy" data-copy="http://localhost:8971/obs/interval">复制</button></td></tr>
              <tr><td>赛程图</td><td><code>http://localhost:8971/obs/bracket</code></td><td><button class="hp-copy" data-copy="http://localhost:8971/obs/bracket">复制</button></td></tr>
              <tr><td>赛后数据图</td><td><code>http://localhost:8971/obs/chart</code></td><td><button class="hp-copy" data-copy="http://localhost:8971/obs/chart">复制</button></td></tr>
            </tbody>
          </table>
          <p>如果不用浏览器源、改走图片源：OBS 里建 5 个图片源，分别指向 <code>PKC_1_上单.png</code> … <code>PKC_5_游走.png</code>，每局用「逐个下载（固定名）」覆盖同名文件，OBS 会自动刷新。</p>
          <ul>
            <li>所有浏览器源的「宽度 / 高度」都填 <b>1920 × 1080</b>，这是板面原生分辨率；填小了会等比缩小，直播端再放大就糊。</li>
            <li>导播台预览窗右下角会显示「显示比例」，<b>100%（1:1）</b>才算对。</li>
            <li>只要赛间板、不要底图：在地址后加 <code>?transparent=1</code>。</li>
          </ul>

          <h4>导播台怎么推</h4>
          <ol>
            <li>左侧「导播台」按 <b>赛前 / 赛中 / 赛后</b> 选场景；</li>
            <li>右侧只显示当前场景的设置，改队名、文案、比分；</li>
            <li>点右上角「<b>推送到直播端</b>」才上画面；</li>
            <li>倒计时是现场操作，「开始 / 继续 / 重置」点了立刻生效，OBS 同步走表，不用推送。</li>
          </ol>
          <table class="hp-table">
            <thead><tr><th>快捷键</th><th>作用</th></tr></thead>
            <tbody>
              <tr><td><code>1</code> ~ <code>6</code></td><td>切到 解说 / 赛间 / 宣传轮播 / 赛程图 / 赛后数据图 / 空白</td></tr>
              <tr><td><code>空格</code></td><td>推送到直播端</td></tr>
              <tr><td><code>U</code></td><td>撤回上一次推送，回到上一帧在播画面</td></tr>
              <tr><td><code>B</code></td><td>一键切「空白」并立刻推送（出事故时的 panic 键）</td></tr>
            </tbody>
          </table>
          <p class="hp-muted">快捷键只在「导播台」视图生效，输入框里打字时不触发。</p>

          <h4>赛后六张轮播</h4>
          <p>先在「对局数据」选好当前局，回导播台选中「赛后数据图」，点「<b>推送本局六张</b>」；右侧六张小按钮可直接跳转，「上一张 / 下一张」手动控制，「暂停 / 开始轮播」控制自动切换，间隔可选 5～45 秒。</p>

          <h4>解说 / 赛间 / 赛程图</h4>
          <ul>
            <li><b>解说</b>：1 / 2 / 3 位解说，椅子和姓名牌跟着变；大场比分手动填，BO 选「自动」时 16 强到半决赛前 BO5、半决赛起 BO7；可弹换人和赛事成就横幅。</li>
            <li><b>赛间</b>：两队从队伍库下拉选，显示队名、5 名选手和倒计时；标题、文案直接输入。</li>
            <li><b>赛程图</b>：先推送一次让 OBS 上线；之后在「淘汰赛赛程」里改分组或落位，画面会实时同步，不用再推送。</li>
          </ul>
        </div>
      </details>

      <details class="hp-sec" id="hp-bracket" data-keywords="淘汰赛 赛程 16强 八强 双败 胜者组 败者组 总决赛 加赛 抽签 分组 晋级">
        <summary><span class="hp-num">5</span><b>淘汰赛赛程图</b><em>16 强单败 → 8 强双败</em></summary>
        <div class="hp-body">
          <h4>赛制</h4>
          <ol>
            <li>预选赛分 <b>A / B / C / D 四个组</b>，每组前 4 名晋级 → <b>16 强</b>。</li>
            <li>16 强赛（第一轮）<b>单败淘汰</b>：每组第 1 名打另一组的第 4 名、第 2 名打第 3 名；抽签抽的是<b>队伍</b>，不是抽组，只要不是本组队，其它哪个组都行。</li>
            <li>赢下 16 强赛的 8 支队进八强，<b>八强开始双败</b>：胜者组输一场掉进败者组，败者组再输一场才淘汰，最后总决赛。</li>
            <li><b>加赛</b>：总决赛里败者组冠军先赢一场时，双方各有一败，图上会自动多出「总决赛 · 加赛」，打赢的才是冠军。</li>
          </ol>
          <h4>四步出图</h4>
          <ol>
            <li><b>① 预选赛分组</b>：4 组各 4 个下拉，从队伍库挑人；懒就点「按队伍库自动填」先铺满再改。</li>
            <li><b>② 抽签（抽队伍）</b>：抽签是你们自己抽，本工具不替你抽——把结果填进 8 场、16 个下拉。每个位置上面标着赛制要求的位次，重复队伍、同组碰面、位次不对会用红字 / 黄字提醒，但不拦你。</li>
            <li><b>③ 点队伍名 = 它晋级</b>：点一下即算赢，再点取消；比分选填。填完上一轮，下一轮会自动填好。</li>
            <li><b>④ 导出</b>：16 强对阵图 / 八强双败图 / 总览长图三张 PNG，也可以「复制文字版赛程」发群。</li>
          </ol>
          <h4>图上看什么</h4>
          <ul>
            <li>每场上下两行，行末带 <b>✓</b> 的是赢家，灰色那行是输家；</li>
            <li>每个位置都写着它从哪来：空位显示 <code>各组第1名 / 各组第4名</code>，前一轮没打完时显示 <code>16强1 胜者</code>、<code>胜八强2 败者</code>，所以空着也能当赛前预告图；</li>
            <li>队伍排进去后，队名前会标预选赛位次（<code>A1</code>、<code>C3</code>）；</li>
            <li>虚线 = 还没分出胜负；败者组橙色虚线 = 从胜者组掉下来的路线。</li>
          </ul>
          <p>导出宽度最低 <b>3840px</b>（16 强图 3840×2100、八强双败图 3840×2160、总览长图 3840×4260），不受其它图「输出尺寸」限制。</p>
        </div>
      </details>

      <details class="hp-sec" id="hp-sync" data-keywords="联动 赛程 对局 场次 回填 比分 清除 撤销 导出范围">
        <summary><span class="hp-num">6</span><b>赛程 ↔ 对局数据联动</b><em>别再跨页面手抄</em></summary>
        <div class="hp-body">
          <h4>从赛程录一局</h4>
          <ol>
            <li>「淘汰赛赛程」里找到排好两队的场次，点这一行下面的 <b>📊 录数据</b>；</li>
            <li>系统切到「对局数据」：没有数据就新建「第1局」，有数据就打开最近一局；</li>
            <li>蓝方 / 红方已按赛程带好，直接 OCR 或手填；</li>
            <li>顶部「赛程场次」下拉可随时切换场次，选「未关联赛程」看历史遗留的局。</li>
          </ol>
          <h4>用局分回填大比分</h4>
          <p>赛程每场显示「已录 N 局 · a:b」，点 <b>回填赛果</b> 把局分写进大比分；只有一方局数更多时才标记晋级，平局只填比分、不自动晋级。</p>
          <h4>清除某场 / 撤销</h4>
          <p>录错场次或整场重录：赛程页每场点 <b>🗑 清除这场</b>（对局页顶部「🗑 清除本场数据」效果一样）。确认框会写明删几局；对阵、分组、队伍库和其他场次都保留。清除后底部有 10 秒「已清除 · 撤销」，点撤销可以整场恢复。</p>
          <div class="hp-note"><b>只想重填比分：</b>用旁边的「↺ 清比分」，不会删对局数据。</div>
        </div>
      </details>

      <details class="hp-sec" id="hp-hero" data-keywords="英雄图 素材 半身像 缩略图 优化 提亮 去底 重新扫描 默认">
        <summary><span class="hp-num">7</span><b>英雄图与素材</b><em>换图不用重启服务</em></summary>
        <div class="hp-body">
          <ul>
            <li>自动扫描 <code>英雄半身像\\</code>（当前 <b>129 张</b>官方半身像），按文件名第一段匹配英雄名；同一英雄有多张时在「英雄图」页点 <code>×N</code> 选默认。</li>
            <li>出图用 1024px 优化图，列表用 320px 缩略图，分别在 <code>英雄缩略图\\</code>、<code>英雄优化\\</code> 自动生成；没生成的新素材会先退回原图。</li>
            <li>换素材：把图丢进「英雄半身像」→ 刷新网页或点「重新扫描素材」即可；想让新图也快起来，删掉两个缓存目录里的同名旧 webp，再跑一次 <code>tools\\build-thumbs.py</code>。</li>
            <li>纯黑 / 纯白底的「透明图层」会按四边同色自动去底；偏暗的官方立绘会按实测亮度自动提亮，不改你的素材文件。</li>
            <li>提亮强度在「多局与导出 → 英雄图提亮」里选「自动 / 加强提亮 / 关闭」；卡片可切「🌗 深色底图」。</li>
          </ul>
        </div>
      </details>

      <details class="hp-sec" id="hp-files" data-keywords="数据 文件 备份 恢复 json 路径 换电脑 ai key 冲突 git">
        <summary><span class="hp-num">8</span><b>数据与文件</b><em>存在哪、怎么备份</em></summary>
        <div class="hp-body">
          <table class="hp-table">
            <thead><tr><th>路径</th><th>放什么</th></tr></thead>
            <tbody>
              <tr><td><code>数据\\</code></td><td>系列赛、队伍、赛程、对局、设置（JSON）</td></tr>
              <tr><td><code>数据\\_backup\\</code></td><td>自动备份，每个文件保留最近 20 份（每分钟最多一份）</td></tr>
              <tr><td><code>数据\\ai-config.json</code></td><td>DeepSeek Key（Windows DPAPI 加密，不能跨 Windows 账户解密）</td></tr>
              <tr><td><code>英雄半身像\\</code></td><td>英雄原图，新图丢这里</td></tr>
              <tr><td><code>英雄缩略图\\</code> / <code>英雄优化\\</code></td><td>自动生成的 320px / 1024px 图</td></tr>
              <tr><td><code>tools\\build-thumbs.py</code></td><td>重新生成缩略图 / 优化图</td></tr>
              <tr><td><code>直播素材\\</code></td><td>直播间背景（16:9 两版 / 4:3 iPad 版）、赛间底图与预览图</td></tr>
              <tr><td><code>使用说明.md</code></td><td>完整文字手册</td></tr>
              <tr><td><code>TROUBLESHOOTING.txt</code></td><td>换电脑 / 启动失败排查</td></tr>
            </tbody>
          </table>
          <ul>
            <li><b>自动备份</b>：写盘前上一版进 <code>数据\\_backup\\</code>，误删场次、改错数据后可把对应备份复制回 <code>数据\\</code>。</li>
            <li><b>原子写</b>：先写临时文件再替换，断电或进程被杀不会留下半截 JSON。</li>
            <li><b>多标签页保护</b>：同时开两个页面时，后保存的会被拦下，页面顶部提示「另一个标签页刚刚改过数据」，点「重新加载本页」即可。</li>
            <li><b>换电脑</b>：整个文件夹拷过去 → 装 Node.js → 双击 <code>启动.bat</code>。AI Key 换了 Windows 账户要重新设置。</li>
          </ul>
        </div>
      </details>

      <details class="hp-sec" id="hp-faq" data-keywords="常见问题 故障 排查 打不开 端口 下拉 空白 识别 糊 不刷新 没保存 恢复 换电脑">
        <summary><span class="hp-num">9</span><b>常见问题</b><em>出问题先搜这里</em></summary>
        <div class="hp-body">
          <details class="hp-q"><summary>双击 HTML 后识别、英雄图、保存都不能用？</summary><div>页面脚本需要本地服务。先双击 <code>启动.bat</code>，再从 <code>http://localhost:8971</code> 打开；直接双击 HTML 只能看界面，读不到本地文件。</div></details>
          <details class="hp-q"><summary>启动.bat 一闪而过，或提示 8971 端口被占用？</summary><div>先确认装了 Node.js（命令行能运行 <code>node -v</code>）；如果旧的黑窗口还开着，关掉再启动。端口被占用时，先打开 <code>http://localhost:8971</code> 看是不是服务已经在跑。详细排查见 <code>TROUBLESHOOTING.txt</code>。</div></details>
          <details class="hp-q"><summary>「选手」下拉是空的，只有一句提示？</summary><div>这支队还没填选手名单。去「队伍库」→ 点队伍卡片的「选手名单」，按 上单 / 打野 / 中路 / 发育路 / 游走 补 5 人并保存；替补写在第六行起。</div></details>
          <details class="hp-q"><summary>截图识别不出来，或者很慢？</summary><div>优先用原图，别用二次压缩 / 转发过的截图；客户端两张页签一起给会更稳。确认「数据\\ai-config.json」里的 Key 可用，或改用「手动粘贴」。本地 Tesseract 只是兜底，识别率低于 AI。</div></details>
          <details class="hp-q"><summary>OCR 把数字认错了怎么办？</summary><div>直接在表格里改，右侧预览会立刻刷新。重点看 <code>0/8</code>、<code>1/7</code>、<code>5/6</code> 和百分比；复核区会写出每格认到了什么，照着改最快。</div></details>
          <details class="hp-q"><summary>OBS 画面发糊？</summary><div>浏览器源的宽度 / 高度必须是 <b>1920 × 1080</b>，导播台预览右下角显示 <b>100%（1:1）</b>。源尺寸填小、再在 OBS 里放大，一定会糊。</div></details>
          <details class="hp-q"><summary>OBS 里的图不刷新？</summary><div>用「🗂 逐个下载（固定名，OBS 用）」，不要手动改名；同名覆盖后 OBS 会自动刷新。确认 OBS 图片源指向的是同一个下载目录，必要时右键源 →「刷新」。</div></details>
          <details class="hp-q"><summary>数据好像没保存 / 两个页面互相覆盖？</summary><div>看页面顶部状态和冲突提示。多标签页同时改同一份数据时，后保存的会被拦下；点「重新加载本页」再改。数据正常保存在 <code>数据\\</code>，也可以从 <code>数据\\_backup\\</code> 找回上一版。</div></details>
          <details class="hp-q"><summary>赛程图改了但直播端不动？</summary><div>第一次要在导播台选「赛程图」并点一次「推送到直播端」，让 OBS 上线；之后改分组 / 落位会实时同步。确认 OBS 打开的是 <code>/obs/bracket</code>。</div></details>
          <details class="hp-q"><summary>清除了某场，还能恢复吗？</summary><div>清除后底部有 10 秒「已清除 · 撤销」，点它整场恢复。超过 10 秒就去 <code>数据\\_backup\\</code> 找对应 JSON 的上一版复制回来。</div></details>
          <details class="hp-q"><summary>为什么赛宝里的 ID 没进「选手」列？</summary><div>赛宝昵称和队伍名单里的「游戏 ID」不是一回事。只有和名单里对得上的英文名才会认，中文昵称照常识别；认不准时工具会刻意留空，等你手填。</div></details>
        </div>
      </details>

      <details class="hp-sec" id="hp-limits" data-keywords="限制 已知 识别率 手机 截图 英雄 头像 昵称 id">
        <summary><span class="hp-num">10</span><b>已知限制</b><em>提前知道，少踩坑</em></summary>
        <div class="hp-body">
          <ul>
            <li>识别只在通过 <code>启动.bat</code> 打开时可用（浏览器安全限制，网页直接打开读不到本地文件）。</li>
            <li>赛宝页面的英雄只有头像，需要手填英雄名（有下拉提示）；客户端截图读的是立绘左下角小字，10 个里认到 6～8 个很正常。</li>
            <li>赛宝昵称 ≠ 名单里的游戏 ID，英文串不会自动当选手名写进表格。</li>
            <li>分路会自动匹配，但最终以你在「位置」列选的分路为准；名单里没这个人时不会硬塞。</li>
            <li>手机截图文字偏小时识别会变差，尽量用原图，别二次压缩或转发。</li>
            <li>英雄立绘源图只有 180×280 左右，铺满英雄格会偏软；要更锐的立绘需要换高清素材。</li>
          </ul>
        </div>
      </details>
    </div>`;
  bindHelp();
}

async function copyHelpText(text){
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

function filterHelp(q){
  const query = String(q || "").trim().toLowerCase();
  const secs = $$("#helpBody .hp-sec");
  let n = 0;
  secs.forEach(sec => {
    const hay = (sec.textContent + " " + (sec.dataset.keywords || "")).toLowerCase();
    const hit = !query || hay.includes(query);
    sec.classList.toggle("hp-hidden", !hit);
    if (query && hit){ sec.open = true; n++; }
    if (!query) sec.open = sec.id === "hp-start";
    sec.querySelectorAll(".hp-q").forEach(q => {
      const qhit = !query || q.textContent.toLowerCase().includes(query);
      q.classList.toggle("hp-hidden", !!query && !qhit);
      if (!query) q.open = false;
      else if (qhit) q.open = true;
    });
  });
  const cnt = $("#helpCount");
  if (cnt) cnt.textContent = query ? (n ? n + " 个分区匹配" : "没有匹配") : "";
  const empty = $("#helpEmpty");
  if (empty) empty.hidden = !query || n > 0;
}

function bindHelp(){
  const root = $("#helpBody");
  if (!root) return;
  root.querySelectorAll("[data-help-tab]").forEach(btn => {
    btn.onclick = () => {
      switchTab(btn.dataset.helpTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });
  root.querySelectorAll("[data-goto]").forEach(btn => {
    btn.onclick = () => {
      const el = document.getElementById(btn.dataset.goto);
      if (!el) return;
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  root.querySelectorAll("[data-copy]").forEach(btn => {
    btn.onclick = async () => {
      const ok = await copyHelpText(btn.dataset.copy);
      const old = btn.textContent;
      if (ok) {
        btn.textContent = "已复制";
      } else {
        const code = btn.closest("tr") && btn.closest("tr").querySelector("code");
        if (code && window.getSelection) {
          const range = document.createRange();
          range.selectNodeContents(code);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          btn.textContent = "已选中";
        } else {
          btn.textContent = "复制失败";
        }
      }
      setTimeout(() => { btn.textContent = old; }, 1600);
    };
  });
  const search = $("#helpSearch");
  if (search) search.oninput = () => filterHelp(search.value);
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
  const [lib, mt, pf, hp, br] = await Promise.all([
    STORE.load("library"), STORE.load("matches"), STORE.load("prefs"),
    STORE.load("heroPick"), STORE.load("bracket")
  ]);
  let ctx = null;
  if (STORE.mode === "api") {
    try {
      const response = await fetch("/api/competition/context", { cache:"no-store" });
      const saved = await response.json();
      if (response.ok) { ctx = saved.context; contextRevision = Number(saved.revision) || 0; }
      else showStoreUnavailable();
    } catch(e) { showStoreUnavailable(); }
  }
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
  $("#btnLegacyTeamMigration").onclick = () => openLegacyTeamMigration();
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
    if (n) collapseImportToolsAfterSuccess("已填入 " + n + " 条 · 核对下方数据");
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
    window.PKC_RECOVERY?.snapshotBeforeChange("clear-bracket-draw", ["bracket"], "清空抽签对阵和赛果");
    const previous = { draw: clone(b.draw || []), win: clone(b.win || {}), score: clone(b.score || {}) };
    b.draw = BK_R16_TYPE.map(() => ({ a:"", b:"" })); b.win = {}; b.score = {};
    renderBkDraw(); renderBkMatches(); scheduleBkRender(); scheduleSave();
    publishBracketLive({ kind:"bulk" });
    if (typeof showUndoBar === "function") showUndoBar("已清空抽签对阵和赛果", () => {
      const next = B();
      next.draw = previous.draw; next.win = previous.win; next.score = previous.score;
      renderBracket(); scheduleBkRender(); scheduleSave(); publishBracketLive({ kind:"bulk" });
      toast("已撤销，抽签对阵和赛果已恢复");
    });
  };
  $("#bkFill").onclick = bkAutoFill;
  $("#bkClearTeams").onclick = () => {
    const b = B();
    window.PKC_RECOVERY?.snapshotBeforeChange("clear-bracket-groups", ["bracket"], "清空 A/B/C/D 组");
    const previous = clone(b.groups || {});
    BK_G.forEach(g => { b.groups[g] = ["","","",""]; });
    renderBracket(); scheduleSave();
    publishBracketLive({ kind:"bulk" });
    if (typeof showUndoBar === "function") showUndoBar("已清空 A/B/C/D 组", () => {
      B().groups = previous;
      syncTeamGroups(); renderBracket(); scheduleSave(); publishBracketLive({ kind:"bulk" });
      toast("已撤销，分组已恢复");
    });
  };
  $("#bkResetAll").onclick = () => {
    if (!confirm("清空全部赛果（比分和晋级）？分组会保留。")) return;
    window.PKC_RECOVERY?.snapshotBeforeChange("clear-bracket-results", ["bracket"], "清空全部赛果");
    const b = B(), previous = { win: clone(b.win || {}), score: clone(b.score || {}) };
    b.win = {}; b.score = {};
    renderBkMatches(); scheduleBkRender(); scheduleSave();
    publishBracketLive({ kind:"meta" });
    toast("已清空赛果");
    if (typeof showUndoBar === "function") showUndoBar("已清空全部赛果", () => {
      const next = B(); next.win = previous.win; next.score = previous.score;
      renderBkMatches(); scheduleBkRender(); scheduleSave(); publishBracketLive({ kind:"meta" });
      toast("已撤销，赛果已恢复");
    });
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
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type !== "pkc:remote-data-saved") return;
    const saved = event.data.context || {};
    showContextStatus("手机已更新本局「" + (saved.gameLabel || S.game?.label || "当前局") + "」，请重新加载后再编辑或生成图表。", [
      { label:"加载最新数据", run:() => location.reload() },
    ]);
  }, { passive:true });

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
