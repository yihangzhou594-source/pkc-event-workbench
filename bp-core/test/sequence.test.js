import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSequence, PICK_STEP_COUNT, alternate } from '../src/sequence.js';
import { Party, ActionType } from '../src/constants.js';

const { BLUE, RED } = Party;

test('PICK 环节固定 10 手', () => {
  assert.equal(PICK_STEP_COUNT, 10);
});

test('alternate 顺序正确', () => {
  assert.deepEqual(alternate(4, BLUE), [BLUE, RED, BLUE, RED]);
  assert.deepEqual(alternate(6, RED), [RED, BLUE, RED, BLUE, RED, BLUE]);
});

test('banCount = 0：无禁用步，仅选择块共 7 步', () => {
  const steps = buildSequence({ banCount: 0 });
  assert.equal(steps.length, 7); // 选1/选2/选2/选1/选1/选2/选1
  assert.equal(steps.filter((s) => s.action === ActionType.BAN).length, 0);
  assert.equal(steps[0].party, BLUE);
});

test('banCount = 3：单轮禁用 6 步，合计 13 步', () => {
  const steps = buildSequence({ banCount: 3 });
  assert.equal(steps.length, 13); // 6 禁用 + 7 选择块
  assert.deepEqual(
    steps.slice(0, 6).map((s) => s.party),
    [BLUE, RED, BLUE, RED, BLUE, RED],
  );
  assert.ok(steps.slice(0, 6).every((s) => s.action === ActionType.BAN));
});

test('banCount = 5：17 步 / 20 个名额，与官方顺序表逐行一致', () => {
  const steps = buildSequence({ banCount: 5 });
  assert.equal(steps.length, 17);
  assert.equal(steps.filter((s) => s.action === ActionType.BAN).length, 10);

  // 前 4 手：蓝、红、蓝、红 禁用
  assert.deepEqual(
    steps.slice(0, 4).map((s) => [s.action, s.party]),
    [
      [ActionType.BAN, BLUE],
      [ActionType.BAN, RED],
      [ActionType.BAN, BLUE],
      [ActionType.BAN, RED],
    ],
  );
  // 第 5 手（索引 4）进入选择，且为蓝方
  assert.equal(steps[4].action, ActionType.PICK);
  assert.equal(steps[4].party, BLUE);

  // 第二轮禁用：红、蓝、红、蓝、红、蓝（与官方规则文案逐字一致）
  assert.deepEqual(
    steps.slice(8, 14).map((s) => s.party),
    [RED, BLUE, RED, BLUE, RED, BLUE],
  );
  assert.ok(steps.slice(8, 14).every((s) => s.action === ActionType.BAN));

  // 选择块：蓝1 / 红2 / 蓝2 / 红1 / 红1 / 蓝2 / 红1
  assert.deepEqual(
    steps.filter((s) => s.action === ActionType.PICK).map((s) => [s.party, s.size]),
    [[BLUE, 1], [RED, 2], [BLUE, 2], [RED, 1], [RED, 1], [BLUE, 2], [RED, 1]],
  );

  // 名额守恒：双方各 10
  const quota = (party) => steps.filter((s) => s.party === party)
    .reduce((n, s) => n + (s.size || 1), 0);
  assert.equal(quota(BLUE), 10);
  assert.equal(quota(RED), 10);
});

test('一步多人的块被标记为 doublePick（红2 / 蓝2 / 蓝2）', () => {
  const steps = buildSequence({ banCount: 5 });
  const doubles = steps.filter((s) => s.doublePick).map((s) => s.index + 1);
  assert.deepEqual(doubles, [6, 7, 16]);
});

test('banCount = 9：两轮禁用合计 18 步，总步数 25', () => {
  const steps = buildSequence({ banCount: 9 });
  assert.equal(steps.length, 25); // 4 + 4 + 14 + 3
  assert.equal(steps.filter((s) => s.action === ActionType.BAN).length, 18);
});

