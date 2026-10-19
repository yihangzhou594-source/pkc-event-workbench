import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeries,
  currentGameLabel,
  canStartBP,
  selectBlueSide,
  startBP,
  commitGame,
  resetCurrentGame,
  isSeriesDecided,
  seriesSnapshot,
  SeriesError,
} from '../src/series.js';
import { lock, snapshot } from '../src/machine.js';
import { Party } from '../src/constants.js';

const TEAMS = { a: { id: 'ag', name: '成都AG超玩会' }, b: { id: 'wolves', name: '重庆狼队' } };
const CFG = { banCount: 5, globalBp: true, boFormat: 7 };

function newSeries(config = CFG) {
  return createSeries({ teams: TEAMS, config });
}

/** 按步序把一局走完（「选2人」这类步骤需要一次给出多个英雄）。
 *  序号全局递增，避免全局 BP 下跨局继承时英雄名重复。 */
let fillSeq = 0;
function finishGame(game) {
  let guard = 0;
  while (game.cursor < game.steps.length && guard++ < 100) {
    const step = game.steps[game.cursor];
    const n = step.size || 1;
    for (let k = 0; k < n; k += 1) lock(game, `h${fillSeq++}_${k}`);
  }
}

test('初始处于「第 1 局 · 选定蓝方」准备态，且未选蓝方时不可开始 BP', () => {
  const s = newSeries();
  assert.equal(currentGameLabel(s), '第 1 局 · 选定蓝方');
  assert.equal(canStartBP(s), false);
  assert.throws(() => startBP(s), (e) => e instanceof SeriesError && e.code === 'blue_side_not_selected');
});

test('选定蓝方后可以开始 BP', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  assert.equal(canStartBP(s), true);
  startBP(s);
  assert.equal(s.game.teamOf[Party.BLUE].name, '成都AG超玩会');
  assert.equal(s.game.teamOf[Party.RED].name, '重庆狼队');
});

test('本局进行中不可更改蓝方', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  startBP(s);
  assert.throws(() => selectBlueSide(s, 'b'), (e) => e.code === 'game_in_progress');
});

test('重置本局回到准备态并清空蓝方', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  startBP(s);
  lock(s.game, '百里守约');
  resetCurrentGame(s);
  assert.equal(s.game, null);
  assert.equal(s.setup.blueSide, null);
  assert.equal(currentGameLabel(s), '第 1 局 · 选定蓝方');
});

test('未打完的局不可结算', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  startBP(s);
  assert.throws(() => commitGame(s, 'a'), (e) => e.code === 'game_not_finished');
});

test('结算一局后比分更新并进入下一局准备态', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  startBP(s);
  finishGame(s.game);
  const result = commitGame(s, 'a');
  assert.equal(result.wins.a, 1);
  assert.equal(result.decided, false);
  assert.equal(result.nextLabel, '第 2 局 · 选定蓝方');
});

test('BO7 需要 4 胜才决出', () => {
  assert.equal(seriesSnapshot(newSeries()).winsNeeded, 4);
  const s = newSeries();
  for (let g = 0; g < 4; g += 1) {
    selectBlueSide(s, 'a');
    startBP(s);
    finishGame(s.game);
    commitGame(s, 'a');
  }
  assert.equal(isSeriesDecided(s), true);
});

test('全局 BP 下后续局次继承已用英雄', () => {
  const s = newSeries();
  selectBlueSide(s, 'a');
  startBP(s);
  lock(s.game, '百里守约');
  finishGame(s.game);
  commitGame(s, 'a');

  selectBlueSide(s, 'b');
  startBP(s);
  assert.ok(s.game.carriedOver.includes('百里守约'));
  assert.throws(() => lock(s.game, '百里守约'), (e) => e.code === 'hero_unavailable');
});

test('关闭全局 BP 时不继承已用英雄', () => {
  const s = newSeries({ banCount: 5, globalBp: false, boFormat: 7 });
  selectBlueSide(s, 'a');
  startBP(s);
  lock(s.game, '百里守约');
  finishGame(s.game);
  commitGame(s, 'a');

  selectBlueSide(s, 'b');
  startBP(s);
  assert.deepEqual(s.game.carriedOver, []);
  lock(s.game, '百里守约');
  assert.equal(snapshot(s.game).bans.blue[0], '百里守约');
});

