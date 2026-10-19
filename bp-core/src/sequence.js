/**
 * 单局步序生成。
 *
 * 规则来源：目标系统房间配置生成规则文案时使用的同一套推导，已由运行时计步器交叉验证
 * （banCount=5 时总步数 20、第 5 手进入选择阶段）。
 *
 * 三种形态：
 *   banCount = 0     无禁用位，直接进入选择
 *   banCount 1..3    单轮禁用，蓝方先行交替，随后进入选择
 *   banCount >= 4    两轮禁用：第一轮各 2 位（蓝先），随后选择前四段；
 *                    第二轮各 banCount-2 位（红先），随后选择后三段
 */

import { Party, ActionType } from './constants.js';

const { BLUE, RED } = Party;

/** 从 start 开始的交替方序列，长度 n。 */
export function alternate(n, start) {
  const other = start === BLUE ? RED : BLUE;
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? start : other));
}

/**
 * 选择环节的固定结构。
 * 展开后顺序为：蓝1 → 红1,红2 → 蓝2,蓝3 → 红3 → 红4 → 蓝4,蓝5 → 红5
 * size > 1 的段即运行时状态里的 doublePick。
 */
export const PICK_BLOCKS = Object.freeze([
  { party: BLUE, size: 1 },
  { party: RED, size: 2 },
  { party: BLUE, size: 2 },
  { party: RED, size: 1 },
  { party: RED, size: 1 },
  { party: BLUE, size: 2 },
  { party: RED, size: 1 },
]);

/** 选择环节总手数（与 banCount 无关）。 */
export const PICK_STEP_COUNT = PICK_BLOCKS.reduce((sum, b) => sum + b.size, 0); // 10

export function normalizeBanCount(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * 选择环节按「块」入表：一个块 = 一步。
 * 「红方选2人」是**一步**（同时占两个名额），不是两步。
 * 早先按人数循环入表会把 17 步的步序撑成 20 步、名额统计翻倍，
 * 并使后续阶段边界整体错位。
 */
function appendPicks(steps, blocks) {
  for (const block of blocks) {
    steps.push({
      index: steps.length,
      action: ActionType.PICK,
      party: block.party,
      size: block.size,
      doublePick: block.size > 1,
      blockStart: true,
    });
  }
}

function appendBans(steps, parties) {
  for (const party of parties) {
    steps.push({
      index: steps.length,
      action: ActionType.BAN,
      party,
      doublePick: false,
      blockStart: true,
    });
  }
}

/**
 * 由房间配置生成单局完整步序表。
 * @param {{banCount?: number}} config
 * @returns {Array<{index:number, action:string, party:string, doublePick:boolean, blockStart:boolean}>}
 */
export function buildSequence(config = {}) {
  const banCount = normalizeBanCount(config.banCount);
  const steps = [];

  if (banCount >= 4) {
    appendBans(steps, alternate(4, BLUE));
    appendPicks(steps, PICK_BLOCKS.slice(0, 4));
    appendBans(steps, alternate((banCount - 2) * 2, RED));
    appendPicks(steps, PICK_BLOCKS.slice(4));
  } else if (banCount > 0) {
    appendBans(steps, alternate(banCount * 2, BLUE));
    appendPicks(steps, PICK_BLOCKS);
  } else {
    appendPicks(steps, PICK_BLOCKS);
  }

  return steps.map((step, index) => ({ ...step, index }));
}

/** 本局禁用位总数（双方合计）。 */
export function banStepCount(config = {}) {
  return buildSequence(config).filter((s) => s.action === ActionType.BAN).length;
}

