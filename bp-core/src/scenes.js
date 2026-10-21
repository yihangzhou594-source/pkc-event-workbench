/**
 * 场景注册表。
 *
 * 场景清单与中文标签取自目标系统的导播台左侧场景栏；「赛后数据图」是
 * 本地工具新增的场景（回合现有数据图生成器）。
 *
 * 关键区分来自其使用指南：
 *   - 切换场景与修改设置 → 只改预览，需「推送到直播端」才上线
 *   - 倒计时与 BP 每一手 → 现场操作，点击立即生效，不需要推送
 */

export const SceneId = Object.freeze({
  BLANK: 'blank',
  INTERVAL: 'interval',
  BRACKET: 'bracket',
  BP: 'bp',
  LINEUP: 'lineup',
  PEAK: 'peak',
  CHART: 'chart',
  COMMENTARY: 'commentary',
  SPOTLIGHT: 'spotlight',
});

/**
 * kind:
 *   'pushed'    预览/在播双层，需推送
 *   'immediate' 现场通道，点击即生效
 */
export const SCENES = Object.freeze([
  { id: SceneId.COMMENTARY, label: '解说', kind: 'pushed', obsPath: '/obs/commentary' },
  { id: SceneId.INTERVAL, label: '赛间', kind: 'pushed', obsPath: '/obs/interval' },
  { id: SceneId.BRACKET, label: '赛程图', kind: 'immediate', obsPath: '/obs/bracket' },
  { id: SceneId.CHART, label: '赛后数据图', kind: 'pushed', obsPath: '/obs/chart' },
  { id: SceneId.SPOTLIGHT, label: '宣传轮播', kind: 'pushed', obsPath: '/obs/spotlight' },
  { id: SceneId.BLANK, label: '空白', kind: 'pushed', obsPath: '/obs/blank' },
]);

const BY_ID = new Map(SCENES.map((s) => [s.id, s]));

export function getScene(id) {
  return BY_ID.get(id) ?? null;
}

export function isSceneId(id) {
  return BY_ID.has(id);
}

export function sceneLabel(id) {
  return BY_ID.get(id)?.label ?? '';
}

/** 现场通道场景：这些场景下的倒计时/BP 操作不经过推送。 */
export function isImmediateScene(id) {
  return BY_ID.get(id)?.kind === 'immediate';
}

export function listSceneIds() {
  return SCENES.map((s) => s.id);
}

