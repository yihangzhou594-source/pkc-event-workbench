import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './json-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, '数据');
const CONTEXT_FILE = path.join(DATA, 'context.json');
const KNOWN_BRACKET_KEYS = new Set([
  ...Array.from({ length: 16 }, (_, i) => `R16-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `WB1-${i + 1}`),
  ...Array.from({ length: 2 }, (_, i) => `WB2-${i + 1}`),
  'WBF', 'LB1-1', 'LB1-2', 'LB2-1', 'LB2-2', 'LB3', 'LBF', 'GF', 'GF2',
]);

const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

export function readCompetitionContext() {
  const context = readJson(CONTEXT_FILE, null);
  const revision = Math.max(0, Number(context?.revision) || 0);
  return { context, revision };
}

function validateContext(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw Object.assign(new Error('context 必须是对象'), { code: 'invalid_context' });
  }
  const seriesId = String(candidate.seriesId || '').trim();
  if (!seriesId) throw Object.assign(new Error('必须指定 seriesId'), { code: 'series_id_required' });
  const library = readJson(path.join(DATA, 'library.json'));
  const series = library?.series?.find((item) => String(item.id) === seriesId);
  if (!series) throw Object.assign(new Error(`找不到系列赛：${seriesId}`), { code: 'series_not_found' });

  const matchKey = String(candidate.matchKey || '').trim();
  const gameId = String(candidate.gameId || '').trim();
  const matchStore = readJson(path.join(DATA, 'matches.json'), { games: {} });
  const games = Array.isArray(matchStore?.games?.[seriesId]) ? matchStore.games[seriesId] : [];
  if (gameId && !games.some((game) => String(game.id) === gameId)) {
    throw Object.assign(new Error(`找不到当前局：${gameId}`), { code: 'game_not_found' });
  }
  if (matchKey) {
    const bracket = readJson(path.join(DATA, 'bracket.json'), {});
    const keyExists = KNOWN_BRACKET_KEYS.has(matchKey)
      || games.some((game) => String(game.matchKey || '') === matchKey)
      || Object.prototype.hasOwnProperty.call(bracket?.[seriesId]?.score || {}, matchKey)
      || Object.prototype.hasOwnProperty.call(bracket?.[seriesId]?.win || {}, matchKey);
    if (!keyExists) throw Object.assign(new Error(`找不到赛程场次：${matchKey}`), { code: 'match_not_found' });
  }
  const teamIds = new Set((series.teams || []).map((team) => String(team.id)));
  const teamById = new Map((series.teams || []).map((team) => [String(team.id), team]));
  for (const field of ['blueId', 'redId']) {
    const id = String(candidate[field] || '').trim();
    if (id && !teamIds.has(id)) throw Object.assign(new Error(`当前系列赛中找不到队伍：${id}`), { code: 'team_not_found' });
  }
  if (candidate.blueId && String(candidate.blueId) === String(candidate.redId)) {
    throw Object.assign(new Error('蓝方与红方不能是同一支队伍'), { code: 'invalid_teams' });
  }
  const clean = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key === 'revision') continue;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) clean[key] = value;
  }
  clean.seriesId = seriesId;
  clean.matchKey = matchKey;
  clean.gameId = gameId;
  clean.seriesName = String(series.name || candidate.seriesName || '');
  const blue = teamById.get(String(candidate.blueId || ''));
  const red = teamById.get(String(candidate.redId || ''));
  if (blue) clean.blueTeam = String(blue.name || '');
  if (red) clean.redTeam = String(red.name || '');
  const game = gameId && games.find((item) => String(item.id) === gameId);
  if (game) clean.gameLabel = String(game.label || candidate.gameLabel || '');
  return clean;
}

export function saveCompetitionContext(candidate, baseRevision, { allowLegacy = false } = {}) {
  const current = readCompetitionContext();
  const expected = Number(baseRevision);
  if (Number.isFinite(expected) && expected !== current.revision) {
    return { conflict: true, ...current };
  }
  if (!Number.isFinite(expected) && !allowLegacy) {
    throw Object.assign(new Error('提交上下文时必须携带 revision'), { code: 'revision_required' });
  }
  const context = validateContext(candidate);
  const revision = current.revision + 1;
  const saved = { ...context, revision, updatedAt: new Date().toISOString() };
  writeJsonAtomic(CONTEXT_FILE, JSON.stringify(saved, null, 2), {
    backupDir: path.join(DATA, '_backup'), key: 'context',
  });
  return { conflict: false, context: saved, revision };
}
