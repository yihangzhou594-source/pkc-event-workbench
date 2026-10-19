/**
 * 基础枚举与文案。
 *
 * 这些取值来自对目标系统运行时的实际观测，不是推测：
 *  - 阶段标签「禁用」「选择」直接取自页面无障碍树
 *  - 分路五个枚举取自其英雄数据表
 */

export const Party = Object.freeze({
  BLUE: 'blue',
  RED: 'red',
});

export const Phase = Object.freeze({
  BAN: 'ban',       // 禁用阶段
  PICK: 'pick',     // 选择阶段
  DONE: 'done',     // 本局结束
});

export const ActionType = Object.freeze({
  BAN: 'ban',
  PICK: 'pick',
});

export const PARTY_LABEL = Object.freeze({
  [Party.BLUE]: '蓝方',
  [Party.RED]: '红方',
});

export const PHASE_LABEL = Object.freeze({
  [Phase.BAN]: '禁用',
  [Phase.PICK]: '选择',
  [Phase.DONE]: '结束',
});

export const ACTION_LABEL = Object.freeze({
  [ActionType.BAN]: '禁用',
  [ActionType.PICK]: '选择',
});

/** 五个分路。短称用于英雄卡角标。 */
export const LANES = Object.freeze(['对抗路', '打野', '中路', '发育路', '游走']);

export const LANE_SHORT = Object.freeze({
  对抗路: '对抗',
  打野: '打野',
  中路: '中路',
  发育路: '发育',
  游走: '游走',
});

export function otherParty(party) {
  return party === Party.BLUE ? Party.RED : Party.BLUE;
}

