/**
 * 统一外壳的静态执行检查。
 *
 * 合并后的页面里，脚本可能引用了被排除在外的元素（例如独立队伍页的控件）。
 * 这类错误在浏览器里表现为「脚本中途抛错、后续逻辑全部不执行」，
 * 而且页面布局看起来正常，很难一眼看出。
 *
 * 本工具用最小 DOM 桩真实执行每个内联脚本块：
 *   - 标记中存在的 id → 返回一个元素桩
 *   - 不存在的 id     → 返回 null（与浏览器一致）
 * 因此能精确定位「顶层访问了不存在的元素」这类问题。
 *
 * 用法：node tools/check-console.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'director', 'console.html');
const html = readFileSync(FILE, 'utf8');

const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const touchedMissing = new Set();

function makeElement() {
  const el = {
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', href: '',
    disabled: false, onclick: null, oninput: null, onchange: null,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    append() {}, replaceChildren() {}, addEventListener() {}, setAttribute() {},
    remove() {},
  };
  return el;
}

globalThis.document = {
  getElementById(id) {
    if (!present.has(id)) touchedMissing.add(id);
    return present.has(id) ? makeElement() : null;
  },
  querySelectorAll: () => [],
  createElement: makeElement,
  addEventListener() {},
  body: Object.assign(makeElement(), {
    firstChild: null,
    insertBefore() {},
  }),
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.location = { origin: 'http://127.0.0.1:8971', pathname: '/', port: '8971' };
// Node 24 的 globalThis.navigator 只有 getter，必须用 defineProperty 覆盖
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: () => Promise.resolve() } },
  configurable: true,
  writable: true,
});
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
globalThis.EventSource = class { addEventListener() {} close() {} };
globalThis.setTimeout = globalThis.setTimeout ?? (() => 0);

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let failed = 0;
blocks.forEach((src, i) => {
  try {
    // 只做顶层执行，不进入事件回调
    new Function(src)();
    console.log(`脚本块 ${i + 1}：顶层执行通过`);
  } catch (err) {
    failed += 1;
    console.log(`脚本块 ${i + 1}：✖ ${err.message}`);
  }
});

if (touchedMissing.size) {
  console.log(`\n提示：以下 id 被访问但标记中不存在：${[...touchedMissing].join(', ')}`);
  console.log('→ 只要不抛错就说明已有守卫；若出现抛错则必须补防护。');
}

console.log(`\n标记中 id 数：${present.size}，内联脚本块：${blocks.length}，抛错：${failed}`);

/**
 * 全局名冲突检测。
 *
 * 传统脚本（非 module）的顶层 const/let/function 共享同一个全局脚本作用域。
 * 合并页面时，chart-core.js 与页面内联脚本若声明同名顶层变量，
 * 浏览器会直接报 SyntaxError 并**整块脚本一行都不执行** ——
 * 页面看起来正常，功能却全无，且静态文本检查完全看不出来。
 */
function topLevelDecls(src) {
  const names = new Set();
  const re = /^\s*(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of src.matchAll(re)) names.add(m[1]);
  return names;
}

/** 整块被 IIFE 包住时，其内部的声明不会进入全局作用域。 */
function isWrapped(src) {
  const opens = /\(function\s*\([^)]*\)\s*\{/.test(src);
  const closes = /\)\s*\(\s*\)\s*;\s*$/.test(src.trim());
  return opens && closes;
}

const CORE_FILES = [
  'pkc-core.js', 'pkc-data.js', 'pkc-draw.js', 'pkc-hero.js',
  'pkc-ocr.js', 'pkc-export.js', 'pkc-app.js',
];
const coreNames = new Set();
for (const name of CORE_FILES) {
  for (const n of topLevelDecls(readFileSync(path.join(ROOT, 'assets', name), 'utf8'))) coreNames.add(n);
}

let collisions = 0;
blocks.forEach((src, i) => {
  if (isWrapped(src)) {
    console.log(`脚本块 ${i + 1} 已包进 IIFE，跳过冲突检查`);
    return;
  }
  const mine = topLevelDecls(src);
  const dup = [...mine].filter((n) => coreNames.has(n));
  if (dup.length) {
    collisions += dup.length;
    console.log(`✖ 脚本块 ${i + 1} 与数据引擎顶层重名：${dup.join(', ')}`);
    console.log('  → 浏览器会报 SyntaxError 并使整块脚本失效；请包进 IIFE 或改名。');
  }
});
if (!collisions) console.log('全局名冲突：无');

process.exit(failed || collisions ? 1 : 0);
