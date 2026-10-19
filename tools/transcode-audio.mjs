/**
 * 批量转码：把音乐素材里的 WAV / M4A / MP3 统一转成体积友好的 MP3。
 *
 * 设计原则：
 *   - 不覆盖原始文件。源目录只读，产物写入 <源目录>_web
 *   - 已存在的产物跳过，可反复执行
 *   - 单文件失败不影响整批
 *
 * 用法：
 *   node tools/transcode-audio.mjs                 转码音乐
 *   node tools/transcode-audio.mjs --dry           只列出计划
 */

import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.FFMPEG_PATH
  || path.join(
    process.env.LOCALAPPDATA ?? '',
    'Microsoft', 'WinGet', 'Packages',
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-9.0.2-full_build', 'bin', 'ffmpeg.exe',
  );

const TARGETS = [
  { name: 'music', src: path.join(ROOT, '音乐素材'), bitrate: '128k' },
];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const only = onlyArg ? onlyArg.split(',') : null;

const CONVERTIBLE = new Set(['.wav', '.m4a', '.mp3', '.aac', '.ogg', '.flac']);

function run(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

if (!existsSync(FFMPEG)) {
  console.error(`未找到 ffmpeg：${FFMPEG}`);
  console.error('可用 FFMPEG_PATH 环境变量指定路径。');
  process.exit(1);
}

const summary = [];

for (const target of TARGETS) {
  if (only && !only.includes(target.name)) continue;
  if (!existsSync(target.src)) {
    console.log(`跳过 ${target.name}：源目录不存在 ${path.relative(ROOT, target.src)}`);
    continue;
  }

  const destDir = `${target.src}_web`;
  const files = (await readdir(target.src, { withFileTypes: true }))
    .filter((e) => e.isFile() && CONVERTIBLE.has(path.extname(e.name).toLowerCase()));

  console.log(`\n=== ${target.name} : ${files.length} 个文件 → ${path.relative(ROOT, destDir)} (${target.bitrate}) ===`);

  if (!dry) await mkdir(destDir, { recursive: true });

  let srcBytes = 0;
  let outBytes = 0;
  let converted = 0;
  let skipped = 0;
  const failures = [];

  for (const entry of files) {
    const srcPath = path.join(target.src, entry.name);
    const outName = `${path.basename(entry.name, path.extname(entry.name))}.mp3`;
    const outPath = path.join(destDir, outName);

    const srcInfo = await stat(srcPath);
    srcBytes += srcInfo.size;

    // MP3 源文件若已是目标码率附近，仍统一转码以保证产物同构；但已有产物则跳过
    if (existsSync(outPath)) {
      const outInfo = await stat(outPath);
      if (outInfo.size > 0) {
        outBytes += outInfo.size;
        skipped += 1;
        continue;
      }
    }

    if (dry) {
      console.log(`  计划 ${entry.name} → ${outName}`);
      continue;
    }

    const result = await run(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', srcPath,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', target.bitrate,
      '-ar', '44100',
      outPath,
    ]);

    if (result.code !== 0) {
      failures.push({ file: entry.name, error: result.stderr.trim().split('\n').slice(-1)[0] || `exit ${result.code}` });
      continue;
    }
    const outInfo = await stat(outPath);
    outBytes += outInfo.size;
    converted += 1;
  }

  const saved = srcBytes > 0 ? (1 - outBytes / srcBytes) * 100 : 0;
  summary.push({ name: target.name, files: files.length, converted, skipped, srcBytes, outBytes, failures });

  console.log(`  新转码 ${converted}，跳过 ${skipped}，失败 ${failures.length}`);
  console.log(`  ${fmtMB(srcBytes)} → ${fmtMB(outBytes)}  节省 ${saved.toFixed(1)}%`);
  for (const f of failures.slice(0, 5)) console.log(`    失败 ${f.file}: ${f.error}`);
}

const totalSrc = summary.reduce((s, r) => s + r.srcBytes, 0);
const totalOut = summary.reduce((s, r) => s + r.outBytes, 0);
if (summary.length) {
  const savedPct = totalSrc > 0 ? ((1 - totalOut / totalSrc) * 100).toFixed(1) : '0.0';
  console.log(`\n合计 ${fmtMB(totalSrc)} → ${fmtMB(totalOut)}  节省 ${savedPct}%`);
}
