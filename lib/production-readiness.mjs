const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const rosterCount = (team) => (
  Array.isArray(team?.players)
    ? team.players.filter((player) => hasText(typeof player === "object" ? player?.name : player)).length
    : 0
);

function blocker(code, label, view) {
  return { code, label, view };
}

function scene(id, label, status, summary, blockers = []) {
  return { id, label, status, summary, blockers };
}

function seriesFromLibrary(library, context) {
  const series = Array.isArray(library?.series) ? library.series : [];
  const seriesId = String(context?.seriesId || library?.currentId || series[0]?.id || "");
  return { seriesId, series: series.find((item) => String(item.id) === seriesId) || null };
}

function drawIndexOf(matchKey) {
  const match = String(matchKey || "").match(/^R16-(\d+)$/);
  const index = match ? Number(match[1]) - 1 : -1;
  return index >= 0 && index < 8 ? index : -1;
}

function currentTeams({ context, game, match, teams }) {
  const byId = new Map(teams.map((team) => [String(team.id), team]));
  const byName = new Map(teams.map((team) => [String(team.name || "").trim(), team]));
  const blueId = String(context?.blueId || game?.ourId || match?.a || "");
  const redId = String(context?.redId || game?.oppId || match?.b || "");
  const blue = byId.get(blueId) || byName.get(String(context?.blueTeam || "").trim()) || null;
  const red = byId.get(redId) || byName.get(String(context?.redTeam || "").trim()) || null;
  return { blue, red };
}

function rosterScene({ id, label, context, blue, red, strict }) {
  const blockers = [];
  if (!hasText(context?.matchKey) && !hasText(context?.gameId) && !blue && !red) {
    blockers.push(blocker("context_missing", "请先选择当前场次", "bracket"));
  }
  if (!blue || !red) blockers.push(blocker("teams_missing", "缺少蓝方或红方队伍", "teams"));
  const blueCount = rosterCount(blue);
  const redCount = rosterCount(red);
  if (blue && blueCount < 5) blockers.push(blocker("blue_roster_short", `蓝方名单 ${blueCount}/5`, "teams"));
  if (red && redCount < 5) blockers.push(blocker("red_roster_short", `红方名单 ${redCount}/5`, "teams"));
  if (blockers.length) {
    return scene(id, label, strict ? "blocked" : "warning", blockers[0].label, blockers);
  }
  return scene(id, label, "ready", `${blue.name} vs ${red.name} · 双方各 5 人`);
}

function chartScene({ context, game }) {
  if (!game) {
    return scene(
      "chart",
      "赛后数据图",
      "blocked",
      "当前局数据尚未关联",
      [blocker("current_game_missing", "请先选择并录入当前局", "data")],
    );
  }
  const rows = Array.isArray(game.rows) ? game.rows.slice(0, 5) : [];
  const completeRows = rows.filter((row) => (
    hasText(row?.our?.name) && hasText(row?.our?.hero)
    && hasText(row?.opp?.name) && hasText(row?.opp?.hero)
  )).length;
  if (completeRows < 5) {
    return scene(
      "chart",
      "赛后数据图",
      "blocked",
      `完整的双方对位 ${completeRows}/5`,
      [blocker("chart_rows_incomplete", "请补齐双方 5 名选手和英雄", "data")],
    );
  }

  const warnings = [];
  const incompleteStats = rows.some((row) => (
    !hasText(row?.our?.gold) || !hasText(row?.opp?.gold)
    || !hasText(row?.our?.k) || !hasText(row?.opp?.k)
  ));
  if (incompleteStats) {
    warnings.push(blocker("chart_stats_incomplete", "部分 KDA 或经济为空，图中会显示短横线", "data"));
  }
  if (!hasText(game.ourScore) || !hasText(game.oppScore)) {
    warnings.push(blocker("chart_score_missing", "本局比分尚未填写", "data"));
  }
  if (!hasText(game.duration)) {
    warnings.push(blocker("chart_duration_missing", "对局时长尚未填写，分均经济可能缺失", "data"));
  }
  return warnings.length
    ? scene("chart", "赛后数据图", "warning", warnings[0].label, warnings)
    : scene("chart", "赛后数据图", "ready", "双方五路数据完整，可推送");
}

function bracketScene(bracket) {
  const draw = Array.isArray(bracket?.draw) ? bracket.draw.slice(0, 8) : [];
  const filledIds = draw.flatMap((match) => [match?.a, match?.b]).filter(hasText);
  const duplicate = filledIds.find((id, index) => filledIds.indexOf(id) !== index);
  if (duplicate) {
    return scene(
      "bracket",
      "赛程图",
      "blocked",
      "同一队伍被放进多个对阵",
      [blocker("bracket_duplicate_team", "请修正赛程中的重复队伍", "bracket")],
    );
  }
  const sameMatch = draw.findIndex((match) => hasText(match?.a) && match.a === match.b);
  if (sameMatch >= 0) {
    return scene(
      "bracket",
      "赛程图",
      "blocked",
      `第 ${sameMatch + 1} 场两边是同一队`,
      [blocker("bracket_same_team", "请修正同队对阵", "bracket")],
    );
  }
  const filled = filledIds.length;
  if (filled < 16) {
    return scene(
      "bracket",
      "赛程图",
      "warning",
      `实时抽签可推送 · 已落位 ${filled}/16`,
      [blocker("bracket_draw_incomplete", "抽签尚未完成，空位会显示占位名", "bracket")],
    );
  }
  return scene("bracket", "赛程图", "ready", "16 强对阵已排满，可实时直播");
}

function statusWeight(status) {
  return status === "blocked" ? 2 : status === "warning" ? 1 : 0;
}

export function buildProductionReadiness({ library = null, matches = null, bracket = null, context = null } = {}) {
  const { seriesId, series } = seriesFromLibrary(library, context);
  const teams = Array.isArray(series?.teams) ? series.teams : [];
  const games = Array.isArray(matches?.games?.[seriesId]) ? matches.games[seriesId] : [];
  const currentGame = games.find((game) => String(game.id) === String(context?.gameId || "")) || null;
  const currentBracket = bracket?.[seriesId] || {};
  const drawIndex = drawIndexOf(context?.matchKey);
  const currentMatch = drawIndex >= 0 ? currentBracket.draw?.[drawIndex] || null : null;
  const { blue, red } = currentTeams({ context, game: currentGame, match: currentMatch, teams });

  const scenes = [
    rosterScene({ id: "commentary", label: "解说", context, blue, red, strict: true }),
    rosterScene({ id: "interval", label: "赛间", context, blue, red, strict: true }),
    bracketScene(currentBracket),
    chartScene({ context, game: currentGame }),
    rosterScene({ id: "spotlight", label: "宣传轮播", context, blue, red, strict: true }),
    scene("blank", "空白", "ready", "随时可用于紧急切空"),
  ];

  const first = scenes.find((item) => item.status === "blocked")
    || scenes.find((item) => item.status === "warning")
    || null;
  const status = scenes.some((item) => item.status === "blocked")
    ? "blocked"
    : scenes.some((item) => item.status === "warning") ? "warning" : "ready";
  const readyCount = scenes.filter((item) => item.status === "ready").length;
  const worst = scenes.slice().sort((a, b) => statusWeight(b.status) - statusWeight(a.status))[0];

  return {
    seriesId,
    context: context ? { ...context } : null,
    overall: {
      status,
      readyCount,
      total: scenes.length,
      summary: status === "ready" ? "全部场景已就绪" : `${worst.label}：${worst.summary}`,
      firstBlocker: first?.blockers?.[0] || null,
      firstBlockerScene: first?.id || null,
    },
    scenes,
  };
}
