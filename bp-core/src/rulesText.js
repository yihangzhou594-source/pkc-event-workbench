/**
 * 规则说明文案生成。
 *
 * 与目标系统的规则条一致，包括三种形态与蓝红交替次序。
 * 文案由配置派生，不需要任何服务端数据。
 */

import { Party } from './constants.js';
import { normalizeBanCount } from './sequence.js';

const { BLUE, RED } = Party;

function alternateNames(count, start) {
  const other = start === BLUE ? RED : BLUE;
  const names = { [BLUE]: '蓝', [RED]: '红' };
  return Array.from({ length: count }, (_, i) => names[i % 2 === 0 ? start : other]).join('、');
}

const PICK_ORDER_FULL = '蓝方1楼，红方1、2楼，蓝方2、3楼，红方3、4楼，蓝方4、5楼，红方5楼';
const PICK_ORDER_FIRST = '蓝方1楼，红方1、2楼，蓝方2、3楼，红方3楼';
const PICK_ORDER_SECOND = '红方4楼，蓝方4、5楼，红方5楼';

function modeSuffix(config) {
  const modes = [];
  if (config.globalBp) modes.push('全局BP');
  if (config.peakDuel) modes.push('巅峰对决');
  return modes.length ? `本场开启${modes.join('及')}。` : '';
}

/** 生成两行规则说明（与面板上的规则条对应）。 */
export function buildRuleLines(config = {}) {
  const banCount = normalizeBanCount(config.banCount);
  const suffix = modeSuffix(config);

  if (banCount === 0) {
    return [
      '本场不设禁用位，双方直接进入选择环节。',
      `选择顺序为${PICK_ORDER_FULL}。${suffix}`,
    ];
  }

  if (banCount < 4) {
    return [
      `双方各拥有${banCount}个禁用位，按${alternateNames(banCount * 2, BLUE)}的顺序轮流禁用。`,
      `禁用结束后进入选择环节，顺序为${PICK_ORDER_FULL}。${suffix}`,
    ];
  }

  return [
    `双方各拥有${banCount}个禁用位，分两轮。第一轮按${alternateNames(4, BLUE)}禁用，随后选择${PICK_ORDER_FIRST}。`,
    `第二轮按${alternateNames((banCount - 2) * 2, RED)}禁用，随后选择${PICK_ORDER_SECOND}。${suffix}`,
  ];
}

/** 面板标题：优先用自定义标题，否则回退到 BO 赛制。 */
export function ruleTitle(config = {}) {
  const custom = (config.ruleTitle || '').trim();
  if (custom) return custom;
  return `BO${config.boFormat || 1}`;
}

/**
 * 最终对外文案：自定义行优先，否则用生成的规则。
 * 面板在两种情况下都只显示非空行。
 */
export function resolveRuleLines(config = {}) {
  const custom = [config.ruleLine1, config.ruleLine2].map((v) => (v || '').trim());
  if (custom.some(Boolean)) return custom.filter(Boolean);
  return buildRuleLines(config).filter(Boolean);
}

