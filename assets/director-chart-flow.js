/* One-click chart publishing; keep preparation separate from going on air. */
(function (root) {
  async function play({ items, context, intervalMs, post, push, previewOnly = false }) {
    if (!Array.isArray(items) || items.length !== 6) throw new Error("本局六张数据图尚未生成，请检查对局数据");
    if (!context?.gameId) throw new Error("请先选择要播放的对局，再点击播放本局数据图");
    const game = items[0].game;
    if (!game || context?.gameId && String(game.id) !== String(context.gameId)
      || context?.seriesId && String(items[0].seriesId) !== String(context.seriesId)
      || context?.matchKey && String(game.matchKey || items[0].matchKey) !== String(context.matchKey)) {
      throw new Error("当前局与生成器不一致，请打开对局数据确认局次后重试");
    }
    const checked = async (action, body) => {
      const result = await post(action, body);
      if (!result || result.error) throw new Error(result?.message || result?.error || "服务没有响应，请重试");
      return result;
    };
    let next = await checked("chart/playlist", {patch:{items,index:0,running:false,intervalMs}});
    next = await checked("scene", {id:"chart"});
    if (previewOnly) return next;
    if (!await push(next)) throw new Error("数据图已准备，尚未切到直播；请检查预检提示后重试");
    return checked("chart/playlist", {patch:{running:true}});
  }
  root.PKCChartFlow = { play };
})(typeof window !== "undefined" ? window : globalThis);
