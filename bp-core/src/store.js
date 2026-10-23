/**
 * 房间状态存储：预览 / 在播 双层 + 现场直连通道。
 *
 * 三层结构：
 *   preview  导播正在编辑的样子
 *   onAir    直播端此刻显示的样子（仅由 push() 从 preview 复制而来）
 *   live     倒计时与 BP 现场状态，不经过推送，改动立即对所有订阅者可见
 *
 * 订阅者（OBS 页面、导播台预览窗）通过 subscribe 收到统一的变更通知。
 * 这是本地单进程实现，无需复刻目标系统的服务端分发。
 */

import { SceneId, getScene, isSceneId } from './scenes.js';

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

function initialPreview(sceneId = SceneId.BLANK) {
  return {
    scene: sceneId,
    settings: {},   // 各场景的自有设置，形如 { bp: {...}, interval: {...} }
    revision: 0,
  };
}

function initialLive() {
  return {
    countdown: { running: false, remainingMs: 0, durationMs: 0 },
    bp: null,        // 由 BP 状态机写入的快照
    chart: null,     // 赛后数据图的渲染数据（由生成器模块产出）
    chartPlaylist: null, // 赛后数据图轮播：items / index / intervalMs / running
    spotlightPlaylist: null,
    bracket: null,   // 淘汰赛赛程图快照（由生成器实时推送）
    bracketChange: null, // 最近一次落位/改动，用于 OBS 端做强调动画
    context: null,   // 当前系列赛 / 场次 / 局（由生成器发布）
    revision: 0,
  };
}

export function createStore(options = {}) {
  const sceneId = isSceneId(options.scene) ? options.scene : SceneId.BLANK;
  const preview = initialPreview(sceneId);
  const live = initialLive();
  const onAir = { ...initialPreview(sceneId), settings: {}, revision: 0 };
  const pushHistory = [];
  let lastPush = null;

  const subscribers = new Set();

  function notify(channel) {
    const payload = { channel, state: snapshot() };
    for (const fn of subscribers) {
      try {
        fn(payload);
      } catch {
        // 单个订阅者抛错不影响其他订阅者
      }
    }
  }

  /** 对外快照。live 是实时值，preview/onAir 分别对应编辑态与播出态。 */
  function snapshot() {
    return {
      preview: { ...preview, settings: { ...preview.settings } },
      onAir: { ...onAir, settings: { ...onAir.settings } },
      live: { ...live },
      isPreviewDirty: preview.scene !== onAir.scene
        || JSON.stringify(preview.settings) !== JSON.stringify(onAir.settings),
      canUndoPush: pushHistory.length > 0,
      lastPush: lastPush ? { ...lastPush } : null,
    };
  }

  /* ---------- 推送型：预览编辑 ---------- */

  function setScene(id) {
    if (!isSceneId(id)) throw new StoreError('unknown_scene', `未知场景：${id}`);
    if (preview.scene === id) return snapshot();
    preview.scene = id;
    preview.revision += 1;
    notify('preview');
    return snapshot();
  }

  /** 写入某个场景的自有设置（例如 bp / interval / chart）。 */
  function setSceneSettings(id, patch) {
    if (!isSceneId(id)) throw new StoreError('unknown_scene', `未知场景：${id}`);
    preview.settings = {
      ...preview.settings,
      [id]: { ...(preview.settings[id] ?? {}), ...patch },
    };
    preview.revision += 1;
    notify('preview');
    return snapshot();
  }

  /** 推送到直播端：把预览整体复制为在播，并记住可撤回的上一帧。 */
  function push(options = {}) {
    if (preview.scene === SceneId.BLANK && onAir.scene !== SceneId.BLANK && !options.force) {
      throw new StoreError('blank_confirm_required', '推送到空白画面前需要确认');
    }
    pushHistory.push({
      scene: onAir.scene,
      settings: JSON.parse(JSON.stringify(onAir.settings)),
      at: new Date().toISOString(),
    });
    if (pushHistory.length > 20) pushHistory.shift();
    onAir.scene = preview.scene;
    onAir.settings = JSON.parse(JSON.stringify(preview.settings));
    onAir.revision += 1;
    lastPush = { scene: onAir.scene, at: new Date().toISOString() };
    notify('onAir');
    return snapshot();
  }

  /** 撤回最近一次推送，预览同步回到恢复后的在播画面。 */
  function undoPush() {
    const previous = pushHistory.pop();
    if (!previous) return snapshot();
    onAir.scene = previous.scene;
    onAir.settings = JSON.parse(JSON.stringify(previous.settings));
    onAir.revision += 1;
    preview.scene = previous.scene;
    preview.settings = JSON.parse(JSON.stringify(previous.settings));
    preview.revision += 1;
    lastPush = { scene: onAir.scene, at: new Date().toISOString(), restored: true };
    notify('onAir');
    return snapshot();
  }

  /** 丢弃预览改动，回到当前在播状态。 */
  function discardPreview() {
    preview.scene = onAir.scene;
    preview.settings = JSON.parse(JSON.stringify(onAir.settings));
    preview.revision += 1;
    notify('preview');
    return snapshot();
  }

  /* ---------- 现场型：点击即生效，不经推送 ---------- */

  function setCountdown(patch) {
    live.countdown = { ...live.countdown, ...patch };
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /**
   * 写入 BP 现场快照。
   * 注意：BP 每一手是现场操作，这里直接进 live，不做预览/在播区分。
   */
  function setBp(bpSnapshot) {
    live.bp = bpSnapshot ? { ...bpSnapshot } : null;
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /** 写入赛后数据图的渲染数据（导播台渲染、OBS 端同源重绘）。 */
  function setChart(chartData) {
    live.chart = chartData ? JSON.parse(JSON.stringify(chartData)) : null;
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /**
   * 赛后数据图轮播。items 是 5 张对位图 + 五路总览，index 由服务端按间隔推进，
   * 这样导播台预览和 OBS 端看到的是同一张。
   */
  function setChartPlaylist(patch) {
    const cur = live.chartPlaylist || {
      items: [], index: 0, intervalMs: 8000, running: false, startedAt: Date.now(),
    };
    const next = { ...cur, ...(patch || {}) };
    if (Array.isArray(next.items)) next.items = JSON.parse(JSON.stringify(next.items));
    next.intervalMs = Math.max(3000, Math.min(60000, Number(next.intervalMs) || 8000));
    const len = Array.isArray(next.items) ? next.items.length : 0;
    next.index = len ? Math.max(0, Math.min(len - 1, Number(next.index) || 0)) : 0;
    next.startedAt = Date.now();
    live.chartPlaylist = next;
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /** 手动上一张 / 下一张（dir = -1 / +1），并重置计时。 */
  function stepChartPlaylist(dir = 1) {
    const p = live.chartPlaylist;
    if (!p || !Array.isArray(p.items) || !p.items.length) return snapshot();
    const n = p.items.length;
    p.index = (p.index + (dir >= 0 ? 1 : -1) + n) % n;
    p.startedAt = Date.now();
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  function setSpotlightPlaylist(patch) {
    const cur = live.spotlightPlaylist || { teams: { blue: {}, red: {} }, items: [], index: 0, intervalMs: 8000, running: false, startedAt: Date.now() };
    const next = { ...cur, ...(patch || {}) };
    next.teams = JSON.parse(JSON.stringify(next.teams || cur.teams));
    next.items = Array.from({ length: 5 }, (_, i) => {
      const item = (Array.isArray(next.items) ? next.items[i] : null) || {};
      return { lane: String(item.lane || ['上单', '打野', '中路', '发育路', '游走'][i]),
        blue: { player: String(item.blue?.player || ''), heroName: String(item.blue?.heroName || ''), heroId: item.blue?.heroId || null },
        red: { player: String(item.red?.player || ''), heroName: String(item.red?.heroName || ''), heroId: item.red?.heroId || null } };
    });
    next.intervalMs = Math.max(3000, Math.min(60000, Number(next.intervalMs) || 8000));
    next.index = Math.max(0, Math.min(4, Number(next.index) || 0));
    if (next.items.filter((item) => item.blue.player && item.red.player).length < 2) next.running = false;
    next.startedAt = Date.now();
    live.spotlightPlaylist = next; live.revision += 1; notify('live'); return snapshot();
  }

  function stepSpotlightPlaylist(dir = 1) {
    const p = live.spotlightPlaylist;
    if (!p?.items?.length) return snapshot();
    p.index = (p.index + (dir >= 0 ? 1 : -1) + 5) % 5; p.startedAt = Date.now();
    live.revision += 1; notify('live'); return snapshot();
  }

  /**
   * 写入淘汰赛赛程图现场快照。
   * 导播在「淘汰赛赛程图」页改分组/抽签时，生成器直接把最新快照推过来，
   * 不经过 preview/onAir 推送；这样抽签过程中 OBS 端可以逐手实时更新。
   */
  function setBracket(payload) {
    const snap = payload && payload.snapshot ? payload.snapshot : null;
    live.bracket = snap ? JSON.parse(JSON.stringify(snap)) : null;
    const prevSeq = live.bracketChange && live.bracketChange.seq ? live.bracketChange.seq : 0;
    const change = payload && payload.change ? payload.change : null;
    live.bracketChange = snap
      ? { ...(change ? JSON.parse(JSON.stringify(change)) : { kind: 'sync' }), seq: prevSeq + 1 }
      : null;
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /** 重播最近一次落位动画（不重新推送数据，只递增序号）。 */
  function replayBracket() {
    if (!live.bracketChange) return snapshot();
    live.bracketChange = { ...live.bracketChange, replay: true, seq: (live.bracketChange.seq || 0) + 1 };
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  /** 写入当前场次上下文。上下文是现场指针，直接进 live，不经过预览推送。 */
  function setContext(ctx) {
    live.context = ctx ? JSON.parse(JSON.stringify(ctx)) : null;
    live.revision += 1;
    notify('live');
    return snapshot();
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return {
    snapshot,
    setScene,
    setSceneSettings,
    push,
    undoPush,
    discardPreview,
    setCountdown,
    setBp,
    setChart,
    setChartPlaylist,
    stepChartPlaylist,
    setSpotlightPlaylist,
    stepSpotlightPlaylist,
    setBracket,
    replayBracket,
    setContext,
    subscribe,
    /** 供测试与调试：当前订阅者数量 */
    subscriberCount: () => subscribers.size,
    sceneOrDefault: () => getScene(preview.scene),
  };
}

