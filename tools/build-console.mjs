/**
 * 构建统一外壳 director/console.html。
 *
 * 架构：**内嵌而非合并**。
 *   生成器（PKC赛后数据图生成器.html）保持原样、不改一字节，
 *   通过 <iframe src="/generator?bare=1"> 内嵌到外壳里。
 *
 * 为什么不再做文本合并：
 *   传统脚本的顶层 const/let/function 共享同一个全局脚本作用域。
 *   把生成器（173KB，含 $ / teams / el 等顶层声明）与外壳脚本拼进同一文档，
 *   会不断产生「同名声明 → SyntaxError → 整块脚本不执行」以及
 *   「生成器脚本依赖的元素不在新外壳里 → 初始化链中断」两类问题，
 *   每次修复都只是把下一个坑往后推。iframe 从根上隔离文档与作用域。
 *
 * 用法：node tools/build-console.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes("--force")) {
  console.error("build-console.mjs 已停用：director/console.html 现在是手写源文件。");
  console.error("运行本脚本会用旧的 director/director.html 覆盖现有导播台布局。");
  console.error("如确需重建，请先备份，再加 --force。");
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'director', 'director.html');
const OUT = path.join(ROOT, 'director', 'console.html');

const shell = await readFile(SHELL, 'utf8');

const shellCss = shell.slice(shell.indexOf('<style>') + 7, shell.indexOf('</style>'));
const dvStart = shell.indexOf('<section class="view on" id="view-director"');
const dvEnd = shell.indexOf('</section>', dvStart);
if (dvStart < 0 || dvEnd < 0) throw new Error('未在 director.html 定位到导播台视图');
const directorView = shell.slice(dvStart, dvEnd + 10);

const dirScriptStart = shell.lastIndexOf('<script>');
const dirScriptEnd = shell.indexOf('</script>', dirScriptStart);
if (dirScriptStart < 0 || dirScriptEnd < 0) throw new Error('未在 director.html 找到内联脚本');
const dirScript = shell.slice(dirScriptStart + 8, dirScriptEnd);

/** 只给顶层选择器加 .pk 作用域（隔离新外壳样式，避免与外层页面互相污染）。 */
function scopeCss(css) {
  return css.split('\n').map((line) => {
    const m = line.match(/^(\s*)([^@\s][^{]*?)(\s*\{.*)$/);
    if (!m) return line;
    const [, indent, selector, rest] = m;
    if (selector.trim().startsWith(':root')) return line;
    return indent + selector.split(',').map((s) => '.pk ' + s.trim()).join(', ') + rest;
  }).join('\n');
}
const scoped = scopeCss(shellCss);

/** 生成器标签页 → 侧栏导航项。点击时直接驱动 iframe 内部的 switchTab。 */
const GEN_TABS = [
  ['data', '对局数据'],
  ['teams', '队伍库'],
  ['hero', '英雄图'],
  ['out', '多局与导出'],
  ['bracket', '淘汰赛赛程图'],
  ['help', '说明'],
];

const navHtml = [
  '      <button class="pk-nav-item on" data-view="director">导播台</button>',
  '      <div class="pk-sep"></div>',
  ...GEN_TABS.map(([tab, label]) =>
    `      <button class="pk-nav-item" data-view="gen" data-tab="${tab}">${label}</button>`),
].join('\n');

const EXTRA_CSS = [
  '.pk-shell{display:flex;height:100vh;background:#eef1f6;font:13.5px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#18212f}',
  '.pk-side{width:196px;flex:0 0 196px;background:#fff;border-right:1px solid #e2e7f0;display:flex;flex-direction:column;padding:12px 10px}',
  '.pk-side-top{font-size:12px;font-weight:700;color:#6b7c93;letter-spacing:.04em;padding:4px 8px 12px;border-bottom:1px solid #edf1f7;margin-bottom:8px}',
  '.pk-nav{display:flex;flex-direction:column;gap:3px;flex:1;overflow:auto}',
  '.pk-nav-item{display:block;width:100%;text-align:left;padding:9px 11px;border:0;border-radius:9px;background:transparent;color:#18212f;font:inherit;cursor:pointer;transition:background-color .18s ease,color .18s ease}',
  '.pk-nav-item:hover{background:#f7f9fc}',
  '.pk-nav-item.on{background:#1f2a44;color:#fff;box-shadow:0 6px 16px rgba(31,42,68,.22)}',
  '.pk-sep{height:1px;background:#edf1f7;margin:7px 4px}',
  '.pk-side-foot{font-size:11.5px;color:#9aa8bb;padding:10px 8px 2px;border-top:1px solid #edf1f7}',
  '.pk-main{flex:1;min-width:0;position:relative;overflow:hidden}',
  '.pk-diag{display:none;margin:0;padding:7px 14px;background:#fdeef1;border-bottom:1px solid #f6c9d4;color:#a32340;font:12px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap}',
  '.pk-diag.on{display:block}',
  '.pk-panes{position:absolute;inset:0}',
  '.pk-pane{position:absolute;inset:0;overflow:auto;opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .26s ease,transform .26s cubic-bezier(.22,.61,.36,1)}',
  '.pk-pane.on{opacity:1;transform:none;pointer-events:auto}',
  '.pk-pane iframe{width:100%;height:100%;border:0;display:block;background:#eef1f6}',
].join('\n');

const SHELL_JS = [
  '"use strict";',
  '(function () {',
  '  var say = window.__pkSay || function () {};',
  '  var navItems = Array.prototype.slice.call(document.querySelectorAll(".pk-nav-item"));',
  '  var paneDirector = document.getElementById("pk-pane-director");',
  '  var paneGen = document.getElementById("pk-pane-gen");',
  '  var genFrame = document.getElementById("genFrame");',
  '  function showDirector(on) {',
  '    paneDirector.classList.toggle("on", on);',
  '    paneGen.classList.toggle("on", !on);',
  '  }',
  '  function gotoGen(tab) {',
  '    showDirector(false);',
  '    var w = genFrame && genFrame.contentWindow;',
  '    if (!w) { say("生成器 iframe 尚未就绪"); return; }',
  '    if (typeof w.switchTab === "function") w.switchTab(tab);',
  '    else say("生成器尚未就绪（switchTab 不可用），请稍后重试");',
  '  }',
  '  navItems.forEach(function (b) {',
  '    b.addEventListener("click", function () {',
  '      navItems.forEach(function (x) { x.classList.toggle("on", x === b); });',
  '      if (b.dataset.view === "director") showDirector(true);',
  '      else gotoGen(b.dataset.tab);',
  '    });',
  '  });',
  '  if (genFrame) {',
  '    genFrame.addEventListener("load", function () { say("生成器已载入"); });',
  '  }',
  '  fetch("/api/director/state").then(function (r) {',
  '    if (!r.ok) throw new Error("HTTP " + r.status);',
  '    return r.json();',
  '  }).then(function (s) {',
  '    if (!s || !s.scenes) say("状态接口返回异常：缺 scenes 字段");',
  '    else say("状态接口正常 · 场景 " + s.scenes.length + " 个 · 预览=" + s.preview.scene + " 在播=" + s.onAir.scene);',
  '  }).catch(function (err) { say("状态接口失败：" + err.message); });',
  '  setTimeout(function () {',
  '    if (!window.__pkDirectorReady) say("导播台脚本未完成初始化（未连上状态流）");',
  '  }, 3000);',
  '})();',
].join('\n');

const DIAG_JS = [
  '"use strict";',
  '(function () {',
  '  var el = document.createElement("div");',
  '  el.className = "pk-diag";',
  '  el.id = "pkDiag";',
  '  document.body.insertBefore(el, document.body.firstChild);',
  '  var lines = [];',
  '  window.__pkSay = function (msg) {',
  '    if (lines.indexOf(msg) >= 0) return;',
  '    lines.push(msg);',
  '    el.textContent = lines.join("\\n");',
  '    el.classList.add("on");',
  '  };',
  '  window.addEventListener("error", function (e) {',
  '    window.__pkSay("JS 错误：" + e.message + "  @" + String(e.filename || "").split("/").pop() + ":" + (e.lineno || ""));',
  '  });',
  '  window.addEventListener("unhandledrejection", function (e) {',
  '    var r = e.reason || {};',
  '    var st = String(r.stack || "").split("\\n").slice(0, 3).join(" <- ");',
  '    window.__pkSay("异步错误：" + (r.message || r) + (st ? "  " + st : ""));',
  '  });',
  '})();',
].join('\n');

const html = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  '<link rel="icon" href="data:," />',
  '<title>PKC 赛事导播系统</title>',
  '<style>',
  scoped,
  '</style>',
  '<style>',
  EXTRA_CSS,
  '</style>',
  '</head>',
  '<body style="margin:0;overflow:hidden">',
  '<script>',
  DIAG_JS,
  '</script>',
  '<div class="pk pk-shell">',
  '  <aside class="pk-side">',
  '    <div class="pk-side-top">PKC 赛事导播系统</div>',
  '    <nav class="pk-nav">',
  navHtml,
  '    </nav>',
  '    <div class="pk-side-foot">薄扶林王者杯 · 上野中射辅对位图</div>',
  '  </aside>',
  '  <div class="pk-main">',
  '    <div class="pk-diag" id="pkDiag"></div>',
  '    <div class="pk-panes" style="top:0">',
  '      <section class="pk-pane on" id="pk-pane-director">',
  directorView,
  '      </section>',
  '      <section class="pk-pane" id="pk-pane-gen">',
  '        <iframe id="genFrame" src="/generator?bare=1" title="数据图生成器"></iframe>',
  '      </section>',
  '    </div>',
  '  </div>',
  '</div>',
  '<script>',
  dirScript,
  '</script>',
  '<script>',
  SHELL_JS,
  '</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

await writeFile(OUT, html, 'utf8');

const kb = (s) => (s.length / 1024).toFixed(1) + ' KB';
console.log('已生成 ' + path.relative(ROOT, OUT) + '（架构：iframe 内嵌）');
console.log('  外壳 CSS   ' + kb(scoped));
console.log('  导播台视图 ' + kb(directorView));
console.log('  成品       ' + kb(html) + '（不含生成器，生成器由 /generator 单独提供）');
