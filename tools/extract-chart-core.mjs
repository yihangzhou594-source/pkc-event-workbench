/**
 * 把 PKC赛后数据图生成器.html 里的内联脚本抽成共用模块 assets/chart-core.js。
 *
 * 目的：让导播台 / OBS 页面与生成器**共用同一套绘制代码**，同时保留生成器原有的下载能力。
 *
 * 做法（机械搬运，不改逻辑）：
 *   1. 原样抽出 <script> 内容 → assets/chart-core.js
 *   2. 唯一一处行为修改：把结尾无条件的 DOMContentLoaded→init 加上守卫，
 *      使没有生成器 DOM 的页面（如 OBS 场景页）加载该模块时不会报错
 *   3. HTML 改为外链同一文件；源文件备份为 *.bak-before-core-extract.html
 *
 * 安全：若备份已存在则拒绝执行（避免二次抽取把外链当成内联再次处理）。
 *
 * 用法：
 *   node tools/extract-chart-core.mjs --dry    只检查与报告
 *   node tools/extract-chart-core.mjs          执行抽取
 */

if (!process.argv.includes("--dry") && !process.argv.includes("--force")) {
  console.error("extract-chart-core.mjs 已停用：assets/chart-core.js 现在是手写维护的共享模块。");
  console.error("运行本脚本会从 HTML 重新抽取并覆盖当前模块。");
  console.error("只检查可加 --dry；确需重抽请先备份，再加 --force。");
  process.exit(1);
}

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'PKC赛后数据图生成器.html');
const BACKUP = path.join(ROOT, 'PKC赛后数据图生成器.bak-before-core-extract.html');
const CORE_DIR = path.join(ROOT, 'assets');
const CORE = path.join(CORE_DIR, 'chart-core.js');

/** init 依赖的页面专属元素；存在它才说明当前是生成器页面。 */
const GUARD_ELEMENT = 'selSeries';

const dry = process.argv.includes('--dry');

if (!existsSync(HTML)) {
  console.error(`未找到 ${path.relative(ROOT, HTML)}`);
  process.exit(1);
}
if (existsSync(BACKUP)) {
  console.error(`备份已存在，说明已抽取过：${path.relative(ROOT, BACKUP)}`);
  console.error('如需重做，请先手动删除备份。');
  process.exit(1);
}

const html = await readFile(HTML, 'utf8');

const openMatch = html.match(/<script(?![^>]*\ssrc=)[^>]*>/);
if (!openMatch) {
  console.error('未找到内联 <script> 块（可能已是外链形式）。');
  process.exit(1);
}
const bodyStart = openMatch.index + openMatch[0].length;
const bodyEnd = html.indexOf('</script>', bodyStart);
if (bodyEnd < 0) {
  console.error('未找到 </script> 收尾。');
  process.exit(1);
}

let body = html.slice(bodyStart, bodyEnd);
const inlineTag = html.slice(openMatch.index, bodyEnd + '</script>'.length);

/* ---------- 报告结构事实 ---------- */
const exportMatches = [...body.matchAll(/\b(?:window\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{\s*[A-Za-z_$]/g)];
const tail = body.slice(-500);
const autoInitRe = /document\.addEventListener\(\s*["']DOMContentLoaded["']\s*,\s*init\s*\)\s*;/;

console.log(`内联脚本块: ${(body.length / 1024).toFixed(1)} KB`);
console.log(`HTML 总长: ${(html.length / 1024).toFixed(1)} KB`);
console.log(`自动初始化语句: ${autoInitRe.test(body) ? '找到' : '未找到（需人工确认）'}`);
console.log(`顶层导出候选: ${[...new Set(exportMatches.map((m) => m[1]))].slice(0, 12).join(', ') || '（未按此模式出现）'}`);
console.log(`尾部片段:\n${tail.trim().split('\n').slice(-4).join('\n')}`);

if (dry) {
  console.log('\n--dry：未写入任何文件。');
  process.exit(0);
}

/* ---------- 1. 行为修改：给自动初始化加守卫 ---------- */
if (!autoInitRe.test(body)) {
  console.error('\n未定位到自动初始化语句，为避免破坏生成器，已中止。');
  process.exit(1);
}
const guarded =
  `if (document.getElementById(${JSON.stringify(GUARD_ELEMENT)})) {\n` +
  `  document.addEventListener("DOMContentLoaded", init);\n` +
  `}`;
body = body.replace(autoInitRe, guarded);

const header =
  `/* 由 tools/extract-chart-core.mjs 自 PKC赛后数据图生成器.html 机械抽取。\n` +
  ` * 逻辑未改动，唯一差异是结尾的自动初始化加了页面守卫，\n` +
  ` * 使 OBS 场景页等无生成器 DOM 的页面也能安全加载本模块。\n` +
  ` */\n`;

/* ---------- 2. 写入共用模块 ---------- */
await mkdir(CORE_DIR, { recursive: true });
await writeFile(CORE, header + body, 'utf8');

/* ---------- 3. HTML 改为外链 ---------- */
const linked = html.replace(inlineTag, '<script src="assets/chart-core.js"></script>');

await copyFile(HTML, BACKUP);
await writeFile(HTML, linked, 'utf8');

console.log(`\n已写出 ${path.relative(ROOT, CORE)} (${((header + body).length / 1024).toFixed(1)} KB)`);
console.log(`已备份 ${path.relative(ROOT, BACKUP)}`);
console.log(`HTML 由 ${(html.length / 1024).toFixed(1)} KB 变为 ${(linked.length / 1024).toFixed(1)} KB`);
console.log(`\n下一步：打开生成器确认功能正常（回归验证），再让 OBS 场景页加载同一模块。`);
