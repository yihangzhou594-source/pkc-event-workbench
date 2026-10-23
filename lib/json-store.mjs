/**
 * JSON 落盘：原子写 + 滚动备份。
 *
 * 为什么不是直接 writeFileSync：
 *   - 写到一半进程被杀 / 断电，会把整个系列赛数据写成半截；
 *   - 现场误操作（清空、覆盖）之后没有任何回退点。
 *
 * 做法：
 *   1. 先写 `<file>.tmp-<pid>-<ts>`；
 *   2. 覆盖前把上一版复制到 `_backup/<key>-<时间戳>.json`（同一 key 每分钟最多一份）；
 *   3. rename 原子替换；
 *   4. 每个 key 只保留最近 20 份备份。
 */
import fs from "node:fs";
import path from "node:path";

const BACKUP_WINDOW_MS = 60 * 1000;
const BACKUP_KEEP = 20;
const lastBackupAt = new Map();

export function writeJsonAtomic(file, raw, opts = {}) {
  const text = String(raw);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, "utf8");
  try {
    if (opts.backup !== false && opts.backupDir) {
      backupPrevious(
        file,
        text,
        opts.backupDir,
        opts.key || path.basename(file, path.extname(file)),
        !!opts.forceBackup,
      );
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* 临时文件可能已被 rename */ }
    throw err;
  }
}

function backupPrevious(file, nextText, backupDir, key, forceBackup = false) {
  if (!fs.existsSync(file)) return;
  let prev = "";
  try { prev = fs.readFileSync(file, "utf8"); } catch { return; }
  if (prev === nextText) return;

  const now = Date.now();
  const backupId = path.resolve(backupDir) + "|" + key;
  if (!forceBackup && now - (lastBackupAt.get(backupId) || 0) < BACKUP_WINDOW_MS) return;
  lastBackupAt.set(backupId, now);

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `${key}-${stamp}.json`);
  try { fs.writeFileSync(dest, prev, "utf8"); } catch { return; }
  prune(backupDir, key);
}

function validBackupKey(key) {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(String(key || ""));
}

export function listBackupVersions(backupDir, key) {
  if (!validBackupKey(key)) throw new Error("备份类型无效");
  let names = [];
  try { names = fs.readdirSync(backupDir); } catch { return []; }
  return names
    .filter((name) => name.startsWith(key + "-") && name.endsWith(".json"))
    .map((name) => {
      const file = path.join(backupDir, name);
      const stat = fs.statSync(file);
      return { name, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function snapshotJsonFile(targetFile, backupDir, key) {
  if (!validBackupKey(key)) throw new Error("备份类型无效");
  if (!fs.existsSync(targetFile)) return null;
  const raw = fs.readFileSync(targetFile, "utf8");
  try { JSON.parse(raw); } catch { throw new Error("当前数据不是有效 JSON，无法创建快照"); }
  fs.mkdirSync(backupDir, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  let dest = path.join(backupDir, `${key}-${stamp}.json`);
  let suffix = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(backupDir, `${key}-${stamp}-${suffix++}.json`);
  }
  fs.writeFileSync(dest, raw, "utf8");
  prune(backupDir, key);
  const stat = fs.statSync(dest);
  return { key, name: path.basename(dest), size: stat.size, mtime: stat.mtimeMs };
}

export function restoreJsonBackup(targetFile, backupDir, key, name) {
  if (!validBackupKey(key)) throw new Error("备份类型无效");
  const safeName = path.basename(String(name || ""));
  if (!safeName || safeName !== name || !safeName.startsWith(key + "-") || !safeName.endsWith(".json")) {
    throw new Error("备份文件名无效");
  }
  const source = path.resolve(backupDir, safeName);
  if (path.dirname(source) !== path.resolve(backupDir)) throw new Error("备份文件名无效");
  const raw = fs.readFileSync(source, "utf8");
  try { JSON.parse(raw); } catch { throw new Error("备份内容不是有效 JSON"); }
  writeJsonAtomic(String(targetFile), raw, {
    backupDir,
    key,
    forceBackup: true,
  });
  const stat = fs.statSync(source);
  return { key, name: safeName, size: stat.size, mtime: stat.mtimeMs };
}

function prune(dir, key) {
  try {
    const files = fs.readdirSync(dir)
      .filter((name) => name.startsWith(key + "-") && name.endsWith(".json"))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(BACKUP_KEEP).forEach(({ name }) => {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* 忽略清理失败 */ }
    });
  } catch { /* 目录不存在就跳过 */ }
}
