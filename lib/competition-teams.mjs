import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './json-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = process.env.PKC_DATA_DIR
  ? path.resolve(process.env.PKC_DATA_DIR)
  : path.join(ROOT, '数据');
const LIBRARY_FILE = path.join(DATA, 'library.json');
const LEGACY_FILE = path.join(DATA, 'teams.json');
const LANES = ['上单', '对抗路', '打野', '中路', '发育路', '游走', '补位'];
const STARTER_LANES = ['上单', '打野', '中路', '发育路', '游走'];

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readLibrary() {
  const library = readJson(LIBRARY_FILE);
  if (!library || !Array.isArray(library.series)) throw new Error('队伍库 library.json 无法读取');
  return library;
}

function readLegacyLibrary() {
  if (!fs.existsSync(LEGACY_FILE)) return { teams: [] };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')); }
  catch { throw new Error('旧队伍文件 teams.json 格式损坏，未进行迁移'); }
  if (!Array.isArray(parsed?.teams)) throw new Error('旧队伍文件 teams.json 缺少 teams 数组，未进行迁移');
  return parsed;
}

export function currentSeriesId() {
  const library = readLibrary();
  return library.currentId || library.series[0]?.id || '';
}

function findSeries(library, seriesId) {
  const id = String(seriesId || '').trim();
  if (!id) throw Object.assign(new Error('必须指定 seriesId'), { code: 'series_id_required' });
  const series = library.series.find((item) => String(item.id) === id);
  if (!series) throw Object.assign(new Error(`找不到系列赛：${id}`), { code: 'series_not_found' });
  return series;
}

function normalizeCanonicalTeam(input, index) {
  const name = String(input?.name ?? '').trim();
  if (!name) throw new Error(`第 ${index + 1} 支队伍缺少名称`);
  const rawPlayers = Array.isArray(input.players) ? input.players.slice(0, 12) : [];
  const players = rawPlayers.map((player) => String(typeof player === 'object' ? player?.name ?? '' : player ?? '').trim());
  const rawLanes = Array.isArray(input.playerLanes) ? input.playerLanes : [];
  const rawMeta = Array.isArray(input.playerMeta) ? input.playerMeta : [];
  const playerLanes = players.map((_, i) => {
    const lane = String(rawLanes[i] ?? rawMeta[i]?.lane ?? STARTER_LANES[i] ?? '').trim();
    return LANES.includes(lane) ? (lane === '对抗路' ? '上单' : lane) : '';
  });
  const playerMeta = players.map((player, i) => ({
    realName: String(rawMeta[i]?.realName ?? (typeof rawPlayers[i] === 'object' ? rawPlayers[i]?.realName : '') ?? '').trim(),
    lane: playerLanes[i],
  }));
  return {
    ...input,
    id: String(input.id || `t_${Date.now().toString(36)}_${index.toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
    name,
    players,
    playerLanes,
    playerMeta,
    logo: String(input.logo ?? '').trim(),
  };
}

export function listCompetitionTeams(seriesId) {
  const library = readLibrary();
  const series = findSeries(library, seriesId);
  const sourceTeams = Array.isArray(series.teams) ? series.teams : [];
  return {
    seriesId: series.id,
    teams: sourceTeams.map(normalizeCanonicalTeam),
    revision: teamRevision(sourceTeams),
  };
}

function teamRevision(teams) {
  return crypto.createHash('sha256').update(JSON.stringify(teams)).digest('hex');
}

export function replaceCompetitionTeams(seriesId, teams, expectedRevision) {
  if (!Array.isArray(teams)) throw Object.assign(new Error('teams 必须是数组'), { code: 'invalid_teams' });
  if (typeof expectedRevision !== 'string' || !expectedRevision) {
    throw Object.assign(new Error('保存队伍资料必须提供读取时的 revision'), { code: 'team_revision_required' });
  }
  const library = readLibrary();
  const series = findSeries(library, seriesId);
  const currentTeams = Array.isArray(series.teams) ? series.teams : [];
  const currentRevision = teamRevision(currentTeams);
  if (currentRevision !== expectedRevision) {
    throw Object.assign(new Error('队伍资料已在其他页面更新，请刷新后重新应用修改'), {
      code: 'team_revision_conflict', revision: currentRevision,
    });
  }
  const normalized = teams.map(normalizeCanonicalTeam);
  const ids = new Set();
  for (const team of normalized) {
    if (ids.has(team.id)) throw Object.assign(new Error(`队伍 ID 重复：${team.id}`), { code: 'duplicate_team_id' });
    ids.add(team.id);
  }
  series.teams = normalized;
  writeJsonAtomic(LIBRARY_FILE, JSON.stringify(library, null, 2), {
    backupDir: path.join(DATA, '_backup'), key: 'library',
  });
  return { seriesId: series.id, teams: normalized, revision: teamRevision(normalized) };
}

export function toDirectorTeams(teams) {
  return teams.map((team) => ({
    ...team,
    players: (team.players || []).map((name, i) => ({
      name: String(name || ''),
      realName: String(team.playerMeta?.[i]?.realName || ''),
      lane: String(team.playerLanes?.[i] || team.playerMeta?.[i]?.lane || ''),
    })),
  }));
}

export function fromDirectorTeams(teams) {
  return teams.map((team) => normalizeCanonicalTeam({
    ...team,
    players: (team.players || []).map((player) => typeof player === 'string' ? player : player?.name || ''),
    playerLanes: (team.players || []).map((player) => typeof player === 'string' ? '' : player?.lane || ''),
    playerMeta: (team.players || []).map((player) => ({ realName: typeof player === 'string' ? '' : player?.realName || '', lane: typeof player === 'string' ? '' : player?.lane || '' })),
  }));
}

function normName(name) {
  return String(name || '').normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g, '').trim().toLocaleLowerCase();
}

function legacyCanonical(team, index) {
  const players = Array.isArray(team?.players) ? team.players.slice(0, 12) : [];
  return normalizeCanonicalTeam({
    id: team?.id || `legacy_${index + 1}`,
    name: team?.name,
    logo: team?.logo,
    players,
    playerLanes: players.map((p) => typeof p === 'object' ? p.lane : ''),
    playerMeta: players.map((p) => ({ realName: typeof p === 'object' ? p.realName : '', lane: typeof p === 'object' ? p.lane : '' })),
  }, index);
}

export function previewLegacyTeams() {
  const library = readLibrary();
  const legacy = readLegacyLibrary();
  const sourceTeams = legacy.teams;
  const current = library.series.flatMap((series) => (series.teams || []).map((team) => ({ seriesId: series.id, team })));
  const entries = sourceTeams.map((source, index) => {
    const candidate = legacyCanonical(source, index);
    const byId = current.find(({ team }) => team.id === candidate.id);
    const byName = byId ? null : current.filter(({ team }) => normName(team.name) === normName(candidate.name));
    const match = byId || (byName?.length === 1 ? byName[0] : null);
    if (!match) return { sourceId: candidate.id, name: candidate.name, status: byName?.length > 1 ? 'ambiguous_name' : 'unmatched', possibleSeriesIds: (byName || []).map((x) => x.seriesId) };
    const existing = normalizeCanonicalTeam(match.team, 0);
    const fields = ['name', 'logo', 'players', 'playerLanes', 'playerMeta'];
    const differences = fields.filter((field) => JSON.stringify(candidate[field] ?? null) !== JSON.stringify(existing[field] ?? null));
    return { sourceId: candidate.id, name: candidate.name, seriesId: match.seriesId, targetId: match.team.id, status: differences.length ? 'conflict' : 'matched', differences };
  });
  return {
    readOnly: true,
    sourceCount: sourceTeams.length,
    entries,
    audit: Array.isArray(library.migrationAudit) ? library.migrationAudit.slice(-10).reverse() : [],
  };
}

export function importLegacyTeams({ confirm, seriesId, include = [], decisions = {} } = {}) {
  if (confirm !== true) throw Object.assign(new Error('显式导入需要 confirm: true'), { code: 'confirmation_required' });
  const targetId = String(seriesId || '').trim();
  if (!targetId) throw Object.assign(new Error('导入未匹配队伍必须指定 seriesId'), { code: 'series_id_required' });
  const library = readLibrary();
  const target = findSeries(library, targetId);
  const legacy = readLegacyLibrary();
  const sourceTeams = legacy.teams;
  const selected = new Set(Array.isArray(include) ? include.map(String) : []);
  const existing = library.series.flatMap((s) => s.teams || []);
  const additions = sourceTeams.map(legacyCanonical).filter((candidate) => selected.has(candidate.id));
  const imported = [];
  const updated = [];
  for (const team of additions) {
    const existingById = existing.find((item) => item.id === team.id);
    if (existingById) continue;
    target.teams = Array.isArray(target.teams) ? target.teams : [];
    target.teams.push(team);
    imported.push(team);
    existing.push(team);
  }
  const reportBySourceId = new Map(previewLegacyTeams().entries.map((entry) => [entry.sourceId, entry]));
  for (const source of sourceTeams) {
    const candidate = legacyCanonical(source, sourceTeams.indexOf(source));
    const report = reportBySourceId.get(candidate.id);
    const choices = decisions && decisions[candidate.id];
    if (!report?.targetId || report.status !== 'conflict' || !choices || typeof choices !== 'object') continue;
    const matchSeries = findSeries(library, report.seriesId);
    const current = matchSeries.teams.find((team) => team.id === report.targetId);
    if (!current) continue;
    const fields = ['name', 'logo', 'players', 'playerLanes', 'playerMeta'];
    const changedFields = [];
    for (const field of fields) {
      if (!report.differences.includes(field) || choices[field] === 'library') continue;
      if (choices[field] !== 'legacy') continue;
      current[field] = candidate[field];
      changedFields.push(field);
    }
    if (changedFields.length) updated.push({ seriesId: report.seriesId, teamId: current.id, name: current.name, fields: changedFields });
  }
  let auditId = '';
  if (imported.length || updated.length) {
    auditId = crypto.randomUUID();
    const audit = Array.isArray(library.migrationAudit) ? library.migrationAudit : [];
    audit.push({
      id: auditId,
      at: new Date().toISOString(),
      source: 'teams.json',
      targetSeriesId: target.id,
      imported: imported.map(({ id, name }) => ({ id, name })),
      updated: updated.map(({ seriesId: updatedSeriesId, teamId, name, fields }) => ({
        seriesId: updatedSeriesId, teamId, name, fields,
      })),
    });
    library.migrationAudit = audit.slice(-100);
    writeJsonAtomic(LIBRARY_FILE, JSON.stringify(library, null, 2), {
      backupDir: path.join(DATA, '_backup'), key: 'library', forceBackup: true,
    });
  }
  return { seriesId: target.id, imported: imported.length, updated: updated.length, teams: imported, updatedTeams: updated, auditId, legacyFileRetained: fs.existsSync(LEGACY_FILE) };
}
