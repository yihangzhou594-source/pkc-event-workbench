/**
 * 单局禁选状态机。
 *
 * 行为全部来自实测，而非对源码的复刻：
 *  - 计步器显示 `n / total`，n 是「下一步的序号」（实测 3/20 → 提交 → 4/20）
 *  - 提交后记录 `上一手`，形如「蓝方禁用 百里守约」；空禁用记为「某方禁用 空」
 *  - 第 4 手之后阶段由「禁用」翻为「选择」
 *  - 撤回 / 重做为单手级，计数与上一手指针同步进退，阶段不变
 *  - 撤回依赖历史栈非空；重做依赖重做栈非空
 */

import { Party, Phase, ActionType, PHASE_LABEL, PARTY_LABEL, ACTION_LABEL } from './constants.js';
import { buildSequence, normalizeBanCount } from './sequence.js';

export class BPError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BPError';
    this.code = code;
  }
}

export function normalizeConfig(config = {}) {
  return {
    banCount: normalizeBanCount(config.banCount),
    globalBp: Boolean(config.globalBp),
    peakDuel: Boolean(config.peakDuel),
    boFormat: Number(config.boFormat ?? 1) || 1,
    ruleTitle: config.ruleTitle ? String(config.ruleTitle).trim() : '',
    ruleLine1: config.ruleLine1 ? String(config.ruleLine1).trim() : '',
    ruleLine2: config.ruleLine2 ? String(config.ruleLine2).trim() : '',
  };
}

/**
 * 创建一局的初始状态。
 * @param {object} config 房间配置
 * @param {{teamOf?: Record<string,string>, carriedOver?: string[]}} options
 *        carriedOver 为全局 BP 下由前序局次继承的已用英雄
 */
export function createGame(config = {}, options = {}) {
  const normalized = normalizeConfig(config);
  const carriedOver = Array.isArray(options.carriedOver) ? [...options.carriedOver] : [];
  return {
    config: normalized,
    steps: buildSequence(normalized),
    teamOf: { [Party.BLUE]: null, [Party.RED]: null, ...(options.teamOf || {}) },
    carriedOver,
    cursor: 0,
    history: [],
    redoStack: [],
    /** 当前步内已锁定但尚未凑满名额的选择（一步多人时逐个锁定）。 */
    pending: [],
  };
}

/* ---------- 派生状态（全部由 cursor 与 history 推导，避免双份真相） ---------- */

export function totalSteps(game) {
  return game.steps.length;
}

export function currentStep(game) {
  return game.steps[game.cursor] ?? null;
}

export function phaseOf(game) {
  const step = currentStep(game);
  if (!step) return Phase.DONE;
  return step.action === ActionType.BAN ? Phase.BAN : Phase.PICK;
}

export function activeParty(game) {
  return currentStep(game)?.party ?? null;
}

/** 面板上显示的 `n / total`，n 为下一步序号（1-based）。 */
export function stepCounter(game) {
  const total = totalSteps(game);
  const n = Math.min(game.cursor + 1, total);
  return { current: game.cursor >= total ? total : n, total };
}

export function isFinished(game) {
  return game.cursor >= game.steps.length;
}

export function usedHeroes(game) {
  const used = new Set(game.carriedOver);
  for (const move of game.history) {
    for (const id of move.heroIds || [move.heroId]) if (id) used.add(id);
  }
  for (const id of game.pending || []) if (id) used.add(id);
  return used;
}

/** 当前步需要几个名额；已结束返回 0。 */
export function currentStepSize(game) {
  const step = currentStep(game);
  return step ? (step.size || 1) : 0;
}

export function bansOf(game, party) {
  return game.history
    .filter((m) => m.action === ActionType.BAN && m.party === party)
    .flatMap((m) => m.heroIds || [m.heroId]);
}

export function picksOf(game, party) {
  return game.history
    .filter((m) => m.action === ActionType.PICK && m.party === party)
    .flatMap((m) => m.heroIds || [m.heroId]);
}

/** 「上一手 …」文案。空禁用渲染为「空」。 */
export function lastMoveText(game) {
  const move = game.history[game.history.length - 1];
  if (!move) return '';
  const party = PARTY_LABEL[move.party];
  const action = ACTION_LABEL[move.action];
  const ids = (move.heroIds || [move.heroId]).filter(Boolean);
  const hero = ids.length ? ids.join('、') : '空';
  return `上一手 ${party}${action} ${hero}`;
}

/** 与面板一致的完整快照，便于渲染层直接消费。 */
export function snapshot(game) {
  const counter = stepCounter(game);
  return {
    phase: phaseOf(game),
    phaseLabel: isFinished(game) ? PHASE_LABEL[Phase.DONE] : PHASE_LABEL[phaseOf(game)],
    activeParty: activeParty(game),
    step: counter,
    finished: isFinished(game),
    lastMove: lastMoveText(game),
    bans: { blue: bansOf(game, Party.BLUE), red: bansOf(game, Party.RED) },
    picks: { blue: picksOf(game, Party.BLUE), red: picksOf(game, Party.RED) },
    canUndo: game.history.length > 0,
    canRedo: game.redoStack.length > 0,
    canReset: game.history.length > 0 || game.cursor > 0,
    /** 当前步骤是否允许留空（空 Ban / 跳过这一手） */
    canSkip: Boolean(currentStep(game)),
    /** 一步多人时的进行中状态：已锁几个 / 共需几个 */
    pending: {
      heroes: [...(game.pending || [])],
      filled: (game.pending || []).length,
      size: currentStepSize(game),
    },
  };
}

/* ---------- 操作 ---------- */

function assertCanCommit(game) {
  if (isFinished(game)) {
    throw new BPError('game_finished', '本局已经结束，无法继续提交');
  }
}

/**
 * 提交一手。
 * @param {object} game
 * 一步多人时**逐个锁定**：每次调用锁一个英雄，记入 pending；
 * 凑满该步名额后才提交并推进到下一步。中途可用 undo 逐个退回。
 *
 * @param {string|null} heroId 单个英雄名；null 表示空禁用 / 跳过这一手
 */
export function lock(game, heroId = null) {
  assertCanCommit(game);
  const step = currentStep(game);
  const size = step.size || 1;

  if (heroId != null) {
    if ((game.pending || []).includes(heroId)) {
      throw new BPError('duplicate_in_step', `这一步已经选过「${heroId}」`);
    }
    if (usedHeroes(game).has(heroId)) {
      throw new BPError('hero_unavailable', `英雄「${heroId}」已被禁用或选择，不可重复使用`);
    }
  }

  game.pending = game.pending || [];
  game.pending.push(heroId ?? null);

  // 凑满名额才真正提交这一步
  if (game.pending.length >= size) {
    const ids = game.pending.slice();
    game.pending = [];
    game.history.push({
      index: game.cursor,
      action: step.action,
      party: step.party,
      heroIds: ids,
      heroId: ids[0] ?? null,
    });
    game.cursor += 1;
    game.redoStack.length = 0; // 新提交清空重做栈
  }
  return snapshot(game);
}

export function undo(game) {
  // 优先退回当前步内尚未提交的选择
  if (game.pending && game.pending.length) {
    game.pending.pop();
    return snapshot(game);
  }
  if (game.history.length === 0) {
    throw new BPError('nothing_to_undo', '没有可撤回的操作');
  }
  const move = game.history.pop();
  game.cursor = Math.max(0, game.cursor - 1);
  game.redoStack.push(move);
  return snapshot(game);
}

export function redo(game) {
  if (game.redoStack.length === 0) {
    throw new BPError('nothing_to_redo', '没有可重做的操作');
  }
  const move = game.redoStack.pop();
  game.history.push(move);
  game.cursor += 1;
  return snapshot(game);
}

/** 重置本局：清空计数、阶段、上一手与历史，回到准备态。 */
export function resetGame(game) {
  game.cursor = 0;
  game.history = [];
  game.redoStack = [];
  game.pending = [];
  return snapshot(game);
}

export { Party, Phase, ActionType };

