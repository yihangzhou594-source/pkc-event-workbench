/**
 * 从 lineupRoom 证据文件中提取内置曲目表，并从其托管地址下载到本地。
 *
 * 曲目表结构（压缩后的 JS 数组）：
 *   [{key:"bp2",name:"常规赛BP",file:"bp2.mp3"}, ...]
 * 托管基础地址经实测确认为：
 *   https://image.xmkhsl.com/khsl/bp-assets/music/
 *
 * 用法：
 *   node tools/fetch-music.mjs               仅提取曲目表
 *   node tools/fetch-music.mjs --download    提取并下载
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_DIR = path.join(ROOT, 'bp-analysis', 'evidence', 'scripts-05', 'files');
const BASE_URL = 'https://image.xmkhsl.com/khsl/bp-assets/music/';
const OUT_DIR = path.join(ROOT, '音乐素材');
const OUT_MANIFEST = path.join(ROOT, '数据', 'musicTracks.json');

const CONCURRENCY = 3;
const TIMEOUT_MS = 60000;

async function findLineupRoom() {
  const stack = [SCRIPT_DIR];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/^lineupRoom.*\.js$/.test(entry.name)) return full;
    }
  }
  throw new Error(`未找到 lineupRoom 文件：${SCRIPT_DIR}`);
}

export function parseTracks(source) {
  const seen = new Map();
  for (const m of source.matchAll(/\{key:"([^"]+)",name:"([^"]+)",file:"([^"]+)"\}/g)) {
    seen.set(m[1], { key: m[1], name: m[2], file: m[3] });
  }
  return [...seen.values()];
}

function safeName(name) {
  return name.replace(/[^\p{Script=Han}A-Za-z0-9_-]/gu, '_');
}

async function downloadOne(track) {
  const ext = path.extname(track.file) || '.mp3';
  // 文件名同时保留序号与中文名，便于在目录里直接辨认
  const target = path.join(OUT_DIR, `${safeName(track.key)}_${safeName(track.name)}${ext}`);
  if (existsSync(target)) {
    const info = await stat(target);
    if (info.size > 0) return { ...track, file: target, bytes: info.size, skipped: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL + track.file, {
      signal: controller.signal,
      headers: { referer: 'https://bp.xmkhsl.com/' },
    });
    if (!res.ok) return { ...track, error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return { ...track, error: '空响应' };
    await writeFile(target, buf);
    return { ...track, file: target, bytes: buf.byteLength };
  } catch (err) {
    return { ...track, error: err.name === 'AbortError' ? '超时' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, limit) {
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

const download = process.argv.includes('--download');
const lineupPath = await findLineupRoom();
const tracks = parseTracks(await readFile(lineupPath, 'utf8'));

console.log(`来源: ${path.relative(ROOT, lineupPath)}`);
console.log(`解析出曲目: ${tracks.length}`);
console.log(`托管地址: ${BASE_URL}`);

if (!download) {
  await mkdir(path.dirname(OUT_MANIFEST), { recursive: true });
  await writeFile(
    OUT_MANIFEST,
    JSON.stringify({ baseUrl: BASE_URL, source: path.relative(ROOT, lineupPath), tracks }, null, 2),
    'utf8',
  );
  for (const t of tracks) console.log(`  ${t.key.padEnd(14)} ${t.name}`);
  console.log(`\n清单已写入 ${path.relative(ROOT, OUT_MANIFEST)}（未下载，加 --download 执行）`);
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`\n开始下载 ${tracks.length} 首 → ${path.relative(ROOT, OUT_DIR)}`);

let done = 0;
const results = await runPool(
  tracks,
  async (track) => {
    const r = await downloadOne(track);
    done += 1;
    process.stdout.write(`  进度 ${done}/${tracks.length}  ${track.name}\n`);
    return r;
  },
  CONCURRENCY,
);

const ok = results.filter((r) => r.bytes != null);
const failed = results.filter((r) => r.error);
const totalBytes = ok.reduce((s, r) => s + r.bytes, 0);

await writeFile(
  OUT_MANIFEST,
  JSON.stringify(
    {
      baseUrl: BASE_URL,
      source: path.relative(ROOT, lineupPath),
      downloadedAt: new Date().toISOString(),
      totalBytes,
      failed: failed.map((f) => ({ key: f.key, name: f.name, error: f.error })),
      tracks: ok.map((r) => ({
        key: r.key,
        name: r.name,
        file: path.relative(ROOT, r.file),
        bytes: r.bytes,
      })),
    },
    null,
    2,
  ),
  'utf8',
);

console.log(`\n完成：成功 ${ok.length}，失败 ${failed.length}，合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
for (const f of failed) console.log(`  失败 ${f.name}: ${f.error}`);
console.log(`清单: ${path.relative(ROOT, OUT_MANIFEST)}`);
