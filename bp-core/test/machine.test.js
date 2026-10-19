import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  lock,
  undo,
  redo,
  resetGame,
  snapshot,
  stepCounter,
  phaseOf,
  activeParty,
  lastMoveText,
  BPError,
} from '../src/machine.js';
import { Party, Phase } from '../src/constants.js';

const CFG = { banCount: 5, globalBp: true, peakDuel: true, boFormat: 7 };

test('初始状态：计数 1/20，禁用阶段，蓝方行动', () => {
  const g = createGame(CFG);
  assert.deepEqual(stepCounter(g), { current: 1, total: 17 });
  assert.equal(phaseOf(g), Phase.BAN);
  assert.equal(activeParty(g), Party.BLUE);
  assert.equal(lastMoveText(g), '');
});

test('提交禁用：计数 +1，上一手文案与观测一致，行动方切换', () => {
  const g = createGame(CFG);
  lock(g, '百里守约');
  assert.deepEqual(stepCounter(g), { current: 2, total: 17 });
  assert.equal(lastMoveText(g), '上一手 蓝方禁用 百里守约');
  assert.equal(activeParty(g), Party.RED);
});

test('空禁用：被记为一个真实步，文案渲染为「空」', () => {
  const g = createGame(CFG);
  lock(g, null);
  assert.equal(lastMoveText(g), '上一手 蓝方禁用 空');
  assert.deepEqual(stepCounter(g), { current: 2, total: 17 });
});

test('第 4 手之后阶段由禁用翻为选择', () => {
  const g = createGame(CFG);
  for (let i = 0; i < 4; i += 1) lock(g, null);
  assert.equal(g.cursor, 4);
  assert.equal(phaseOf(g), Phase.PICK);
  assert.deepEqual(stepCounter(g), { current: 5, total: 17 });
});

test('重复使用同一英雄被拒绝', () => {
  const g = createGame(CFG);
  lock(g, '百里守约');
  assert.throws(() => lock(g, '百里守约'), (e) => e instanceof BPError && e.code === 'hero_unavailable');
});

test('撤回：严格复现实测序列（4/20 → 3/20，上一手回退，阶段不变）', () => {
  const g = createGame(CFG);
  // 实测现场：房内已进行 2 手，第 2 手为「红方禁用 狄仁杰」，面板显示 3 / 20
  lock(g, '兰陵王');        // 第 1 手 蓝方禁用
  lock(g, '狄仁杰');        // 第 2 手 红方禁用
  assert.deepEqual(stepCounter(g), { current: 3, total: 17 });
  assert.equal(lastMoveText(g), '上一手 红方禁用 狄仁杰');

  // 提交第 3 手：蓝方禁用 百里守约 → 面板 4 / 20
  lock(g, '百里守约');
  assert.deepEqual(stepCounter(g), { current: 4, total: 17 });
  assert.equal(lastMoveText(g), '上一手 蓝方禁用 百里守约');
  assert.equal(phaseOf(g), Phase.BAN);

  // 撤回 → 与实测一致：3 / 20、上一手回到第 2 手、阶段仍为禁用
  undo(g);
  assert.deepEqual(stepCounter(g), { current: 3, total: 17 });
  assert.equal(lastMoveText(g), '上一手 红方禁用 狄仁杰');
  assert.equal(phaseOf(g), Phase.BAN);

  // 重做 → 与实测一致：4 / 20、上一手回到「蓝方禁用 百里守约」
  redo(g);
  assert.deepEqual(stepCounter(g), { current: 4, total: 17 });
  assert.equal(lastMoveText(g), '上一手 蓝方禁用 百里守约');
});

test('撤回跨越第一轮边界时，阶段随之回退（派生自当前手次，非独立状态）', () => {
  const g = createGame(CFG);
  for (let i = 0; i < 4; i += 1) lock(g, null);
  // 游标 4 → 下一手是选择
  assert.equal(phaseOf(g), Phase.PICK);
  undo(g);
  // 游标 3 → 下一手回到禁用
  assert.equal(phaseOf(g), Phase.BAN);
});

test('重做：完整还原上一步', () => {
  const g = createGame(CFG);
  lock(g, '百里守约');
  const snap = snapshot(g);
  undo(g);
  redo(g);
  assert.deepEqual(snapshot(g), snap);
});

test('撤回后新的提交会清空重做栈', () => {
  const g = createGame(CFG);
  lock(g, '百里守约');
  undo(g);
  assert.equal(g.redoStack.length, 1);
  lock(g, '狄仁杰');
  assert.equal(g.redoStack.length, 0);
  assert.throws(() => redo(g), (e) => e.code === 'nothing_to_redo');
});

test('空历史时无法撤回', () => {
  const g = createGame(CFG);
  assert.throws(() => undo(g), (e) => e.code === 'nothing_to_undo');
});

test('重置本局：清空计数、阶段、上一手与历史', () => {
  const g = createGame(CFG);
  lock(g, '百里守约');
  lock(g, null);
  resetGame(g);
  assert.deepEqual(stepCounter(g), { current: 1, total: 17 });
  assert.equal(lastMoveText(g), '');
  assert.equal(g.history.length, 0);
  assert.equal(snapshot(g).canUndo, false);
  assert.equal(snapshot(g).canRedo, false);
});

test('启用条件：撤回依赖历史栈，重做依赖重做栈', () => {
  const g = createGame(CFG);
  assert.equal(snapshot(g).canUndo, false);
  assert.equal(snapshot(g).canRedo, false);
  lock(g, null);
  assert.equal(snapshot(g).canUndo, true);
  assert.equal(snapshot(g).canRedo, false);
  undo(g);
  assert.equal(snapshot(g).canRedo, true);
});

test('全局 BP 带入的已用英雄不可再选', () => {
  const g = createGame(CFG, { carriedOver: ['百里守约'] });
  assert.throws(() => lock(g, '百里守约'), (e) => e.code === 'hero_unavailable');
});

test('「选2人」逐个锁定：锁第一个不推进，凑满两个才提交', () => {
  const g = createGame(CFG);
  for (let i = 0; i < 4; i += 1) lock(g, null);   // 过掉第一轮禁用
  lock(g, '蓝一楼');                               // 第 5 步：蓝方选 1 人，立即提交
  assert.equal(g.cursor, 5);
  assert.equal(g.steps[g.cursor].size, 2, '第 6 步应为红方选 2 人');

  // 锁第一个：只记入 pending，不推进
  lock(g, '红一楼');
  assert.equal(g.cursor, 5, '只锁一个时不应推进');
  assert.deepEqual(snapshot(g).pending, { heroes: ['红一楼'], filled: 1, size: 2 });

  // 已锁的不可重复
  assert.throws(() => lock(g, '红一楼'), (e) => e.code === 'duplicate_in_step');
  // 已在他处用过的也不可用
  assert.throws(() => lock(g, '蓝一楼'), (e) => e.code === 'hero_unavailable');

  // 中途可逐个退回
  undo(g);
  assert.deepEqual(snapshot(g).pending.heroes, []);
  assert.equal(g.cursor, 5);

  // 重新锁满两个才推进
  lock(g, '红一楼');
  lock(g, '红二楼');
  assert.equal(g.cursor, 6, '凑满两个后应推进');
  assert.deepEqual(snapshot(g).picks.red, ['红一楼', '红二楼']);
});

test('走完全部 17 步后进入结束态并拒绝继续提交', () => {
  const g = createGame(CFG);
  let guard = 0;
  while (g.cursor < g.steps.length && guard++ < 100) {
    const step = g.steps[g.cursor];
    const n = step.size || 1;
    for (let k = 0; k < n; k += 1) lock(g, `h${g.cursor}_${k}`);
  }
  assert.equal(g.cursor, 17);
  assert.equal(phaseOf(g), Phase.DONE);
  assert.equal(snapshot(g).finished, true);
  assert.throws(() => lock(g, 'x'), (e) => e.code === 'game_finished');

  // 名额守恒：双方各 10 个
  const s = snapshot(g);
  assert.equal(s.picks.blue.length + s.bans.blue.length, 10);
  assert.equal(s.picks.red.length + s.bans.red.length, 10);
});

