/**
 * 系列赛与局次编排。
 *
 * 这一层来自实测发现：目标系统在 BP 之前还有一块准备界面
 *   「第 N 局 · 选定蓝方」 + 「开始 BP」（未选蓝方时为 disabled）
 * 也就是说状态机的真正起点不是禁用阶段，而是逐局的蓝方选定。
 */

import { Party } from './constants.js';
import { createGame, normalizeConfig, isFinished, resetGame } from './machine.js';

export class SeriesError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SeriesError';
    this.code = code;
  }
}

function normalizeTeams(teams) {
  if (!teams || typeof teams !== 'object') {
    throw new SeriesError('teams_required', '必须提供两支队伍');
  }
  const { a, b } = teams;
  if (!a || !b) {
    throw new SeriesError('teams_required', '必须提供两支队伍（a / b）');
  }
  return { a, b };
}

export function winsNeeded(boFormat) {
  return Math.ceil(Number(boFormat || 1) / 2);
}

/**
 * 创建系列赛。
 * @param {{teams:{a:object,b:object}, config?:object}} options
 */
export function createSeries({ teams, config = {} } = {}) {
  const normalizedConfig = normalizeConfig(config);
  return {
    config: normalizedConfig,
    teams: normalizeTeams(teams),
    wins: { a: 0, b: 0 },
    games: [],          // 已完成的局
    gameIndex: 0,       // 当前第几局（0-based）
    setup: { blueSide: null },
    game: null,
  };
}

export function currentGameLabel(series) {
  return `第 ${series.gameIndex + 1} 局 · 选定蓝方`;
}

/** 「开始 BP」的启用条件：已选定蓝方。 */
export function canStartBP(series) {
  return series.setup.blueSide != null && series.game == null;
}

export function selectBlueSide(series, teamKey) {
  if (teamKey !== 'a' && teamKey !== 'b') {
    throw new SeriesError('invalid_team', '蓝方只能取队伍 a 或 b');
  }
  if (series.game != null) {
    throw new SeriesError('game_in_progress', '本局已开始，无法更改蓝方');
  }
  series.setup.blueSide = teamKey;
  return currentGameLabel(series);
}

/**
 * 开始本局 BP。
 * 全局 BP 下，把此前各局已用英雄带入本局作为不可用集合。
 */
export function startBP(series) {
  if (!canStartBP(series)) {
    throw new SeriesError('blue_side_not_selected', '尚未选定蓝方，无法开始 BP');
  }
  const { a, b } = series.teams;
  const blueKey = series.setup.blueSide;
  const redKey = blueKey === 'a' ? 'b' : 'a';

  let carriedOver = [];
  if (series.config.globalBp) {
    const used = new Set();
    for (const g of series.games) {
      for (const move of g.history) if (move.heroId) used.add(move.heroId);
    }
    carriedOver = [...used];
  }

  series.game = createGame(series.config, {
    teamOf: {
      [Party.BLUE]: blueKey === 'a' ? a : b,
      [Party.RED]: redKey === 'a' ? a : b,
    },
    carriedOver,
  });
  return series.game;
}

/** 本局是否已打完。 */
export function isGameOver(series) {
  return series.game != null && isFinished(series.game);
}

export function isSeriesDecided(series) {
  const need = winsNeeded(series.config.boFormat);
  return series.wins.a >= need || series.wins.b >= need;
}

/**
 * 结算本局并推进到下一局次的准备态。
 * @param {'a'|'b'} winner 本局胜方
 */
export function commitGame(series, winner) {
  if (!isGameOver(series)) {
    throw new SeriesError('game_not_finished', '本局尚未结束，无法结算');
  }
  if (winner !== 'a' && winner !== 'b') {
    throw new SeriesError('invalid_winner', '胜方只能取队伍 a 或 b');
  }
  series.wins[winner] += 1;
  series.games.push(series.game);
  series.game = null;
  series.gameIndex += 1;
  series.setup = { blueSide: null };
  return {
    wins: { ...series.wins },
    decided: isSeriesDecided(series),
    nextLabel: isSeriesDecided(series) ? null : currentGameLabel(series),
  };
}

/** 在任意时刻重置本局，回到「选定蓝方」的准备态。 */
export function resetCurrentGame(series) {
  if (series.game) resetGame(series.game);
  series.game = null;
  series.setup = { blueSide: null };
  return currentGameLabel(series);
}

export function seriesSnapshot(series) {
  return {
    label: series.game == null ? currentGameLabel(series) : `第 ${series.gameIndex + 1} 局`,
    wins: { ...series.wins },
    winsNeeded: winsNeeded(series.config.boFormat),
    decided: isSeriesDecided(series),
    blueSide: series.setup.blueSide,
    canStartBP: canStartBP(series),
    inGame: series.game != null,
  };
}

