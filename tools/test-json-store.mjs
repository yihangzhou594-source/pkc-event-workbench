import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listBackupVersions, restoreJsonBackup, snapshotJsonFile } from "../lib/json-store.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkc-json-store-"));
try {
  const backupDir = path.join(dir, "_backup");
  const target = path.join(dir, "matches.json");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(target, '{"games":{"s1":[{"id":"new"}]}}', "utf8");
  const older = path.join(backupDir, "matches-2026-10-23T09-00-00-000Z.json");
  const newer = path.join(backupDir, "matches-2026-10-23T10-00-00-000Z.json");
  fs.writeFileSync(older, '{"games":{"s1":[{"id":"old"}]}}', "utf8");
  fs.writeFileSync(newer, '{"games":{"s1":[]}}', "utf8");

  const versions = listBackupVersions(backupDir, "matches");
  assert.equal(versions.length, 2);
  assert.equal(versions[0].name, path.basename(newer));
  assert.ok(versions[0].mtime >= versions[1].mtime);

  snapshotJsonFile(target, backupDir, "matches");
  assert.ok(listBackupVersions(backupDir, "matches").some((item) =>
    fs.readFileSync(path.join(backupDir, item.name), "utf8").includes('"new"')));

  restoreJsonBackup(target, backupDir, "matches", path.basename(older));
  assert.equal(fs.readFileSync(target, "utf8"), '{"games":{"s1":[{"id":"old"}]}}');
  const backups = listBackupVersions(backupDir, "matches");
  assert.ok(backups.some((item) => fs.readFileSync(path.join(backupDir, item.name), "utf8").includes('"new"')));

  assert.throws(
    () => restoreJsonBackup(target, backupDir, "matches", "../matches-2026-10-23T10-00-00-000Z.json"),
    /备份文件名无效/,
  );
  assert.throws(
    () => restoreJsonBackup(target, backupDir, "../matches", path.basename(newer)),
    /备份类型无效/,
  );
  console.log("test-json-store: ok");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
