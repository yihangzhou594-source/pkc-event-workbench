import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, StoreError } from '../src/store.js';
import { SceneId, SCENES, sceneLabel, isSceneId } from '../src/scenes.js';

test('场景注册表包含六个场景且标签正确', () => {
  assert.equal(SCENES.length, 6);
  assert.deepEqual(
    SCENES.map((s) => s.label),
    ['解说', '赛间', '赛程图', '赛后数据图', '宣传轮播', '空白'],
  );
  assert.equal(sceneLabel(SceneId.CHART), '赛后数据图');
  assert.equal(sceneLabel(SceneId.BRACKET), '赛程图');
  assert.equal(sceneLabel(SceneId.SPOTLIGHT), '宣传轮播');
  assert.equal(isSceneId('nope'), false);
});

test('切换场景只改预览，不影响在播', () => {
  const s = createStore();
  s.setScene(SceneId.COMMENTARY);
  const snap = s.snapshot();
  assert.equal(snap.preview.scene, SceneId.COMMENTARY);
  assert.equal(snap.onAir.scene, SceneId.BLANK);
  assert.equal(snap.isPreviewDirty, true);
});

test('推送后预览与在播一致，脏标记清除', () => {
  const s = createStore();
  s.setScene(SceneId.INTERVAL);
  s.push();
  const snap = s.snapshot();
  assert.equal(snap.onAir.scene, SceneId.INTERVAL);
  assert.equal(snap.isPreviewDirty, false);
});

test('丢弃预览回到在播状态', () => {
  const s = createStore();
  s.setScene(SceneId.COMMENTARY);
  s.push();
  s.setScene(SceneId.CHART);
  assert.equal(s.snapshot().preview.scene, SceneId.CHART);
  s.discardPreview();
  assert.equal(s.snapshot().preview.scene, SceneId.COMMENTARY);
  assert.equal(s.snapshot().isPreviewDirty, false);
});

test('场景设置按场景隔离，推送后整体复制', () => {
  const s = createStore();
  s.setSceneSettings(SceneId.INTERVAL, { bottomTitle: '2026 春季赛 · 季后赛' });
  s.setSceneSettings(SceneId.COMMENTARY, { showTeamPanel: true });
  s.push();
  const snap = s.snapshot();
  assert.equal(snap.onAir.settings[SceneId.INTERVAL].bottomTitle, '2026 春季赛 · 季后赛');
  assert.equal(snap.onAir.settings[SceneId.COMMENTARY].showTeamPanel, true);
});

test('在播设置是深拷贝，改预览不会连带改在播', () => {
  const s = createStore();
  s.setSceneSettings(SceneId.COMMENTARY, { showTeamPanel: true });
  s.push();
  s.setSceneSettings(SceneId.COMMENTARY, { showTeamPanel: false });
  const snap = s.snapshot();
  assert.equal(snap.preview.settings[SceneId.COMMENTARY].showTeamPanel, false);
  assert.equal(snap.onAir.settings[SceneId.COMMENTARY].showTeamPanel, true);
});

test('倒计时与 BP 走现场通道，不经推送即可见（与指南一致）', () => {
  const s = createStore();
  s.setCountdown({ running: true, durationMs: 90000, remainingMs: 32000 });
  s.setBp({ phase: 'ban', step: { current: 4, total: 20 } });

  const snap = s.snapshot();
  assert.equal(snap.live.countdown.running, true);
  assert.equal(snap.live.bp.step.current, 4);
  // 现场改动不产生预览脏标记
  assert.equal(snap.isPreviewDirty, false);
});

test('数据图数据进现场通道，可供 OBS 端同源重绘', () => {
  const s = createStore();
  const chart = { kind: 'postmatch', seriesId: 's1', games: [{ index: 1, winner: 'a' }] };
  s.setChart(chart);
  assert.deepEqual(s.snapshot().live.chart, chart);
  // 深拷贝：外部改原对象不影响存储
  chart.games[0].winner = 'b';
  assert.equal(s.snapshot().live.chart.games[0].winner, 'a');
});

test('赛程图快照进现场通道，并可重播最近落位', () => {
  const s = createStore();
  s.setBracket({
    snapshot: { title: '测试赛程', draw: [{ a: 't1', b: '' }] },
    change: { kind: 'draw', match: 0, side: 'a', teamId: 't1' },
  });
  let snap = s.snapshot();
  assert.equal(snap.live.bracket.draw[0].a, 't1');
  assert.equal(snap.live.bracketChange.kind, 'draw');
  const seq = snap.live.bracketChange.seq;
  s.replayBracket();
  snap = s.snapshot();
  assert.equal(snap.live.bracketChange.seq, seq + 1);
  assert.equal(snap.live.bracketChange.replay, true);
});

test('数据图轮播进现场通道，可循环上一张 / 下一张', () => {
  const s = createStore();
  s.setChartPlaylist({
    items: [{ label: '上单' }, { label: '打野' }, { label: '总览' }],
    index: 0, running: true, intervalMs: 8000,
  });
  let p = s.snapshot().live.chartPlaylist;
  assert.equal(p.items.length, 3);
  assert.equal(p.running, true);
  s.stepChartPlaylist(1);
  assert.equal(s.snapshot().live.chartPlaylist.index, 1);
  s.stepChartPlaylist(-1);
  assert.equal(s.snapshot().live.chartPlaylist.index, 0);
  s.stepChartPlaylist(-1);
  assert.equal(s.snapshot().live.chartPlaylist.index, 2);
});

test('订阅者收到带通道名的通知', () => {
  const s = createStore();
  const seen = [];
  const off = s.subscribe((p) => seen.push(p.channel));

  s.setScene(SceneId.COMMENTARY);
  s.push();
  s.setCountdown({ running: true });

  assert.deepEqual(seen, ['preview', 'onAir', 'live']);
  off();
  s.setScene(SceneId.BLANK);
  assert.equal(seen.length, 3);
  assert.equal(s.subscriberCount(), 0);
});

test('单个订阅者抛错不影响其他订阅者', () => {
  const s = createStore();
  let reached = false;
  s.subscribe(() => { throw new Error('boom'); });
  s.subscribe(() => { reached = true; });
  s.setScene(SceneId.COMMENTARY);
  assert.equal(reached, true);
});

test('未知场景被拒绝', () => {
  const s = createStore();
  assert.throws(() => s.setScene('nope'), (e) => e instanceof StoreError && e.code === 'unknown_scene');
  assert.throws(() => s.setSceneSettings('nope', {}), (e) => e.code === 'unknown_scene');
});

test('context 走现场通道，订阅者能收到', () => {
  const s = createStore();
  let got = null;
  s.subscribe((p) => { if (p.channel === 'live') got = p.state.live.context; });
  s.setContext({ seriesId: 's1', matchKey: 'R16-5', gameId: 'g1' });
  assert.equal(s.snapshot().live.context.matchKey, 'R16-5');
  assert.equal(got.matchKey, 'R16-5');
  s.setContext(null);
  assert.equal(s.snapshot().live.context, null);
});


