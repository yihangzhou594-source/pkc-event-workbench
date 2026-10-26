import {
  manualCluster,
  normalizeHeroStats,
  recountClusters,
} from "./hero-stats.mjs";

const LANE_FALLBACK = ["上单", "打野", "中路", "发育路", "游走"];
const clean = (value) => String(value ?? "").trim();

function selectedSeries(library, seriesId) {
  const list = Array.isArray(library?.series) ? library.series : [];
  return list.find((series) => String(series.id) === String(seriesId || library?.currentId || ""))
    || list.find((series) => String(series.id) === String(library?.currentId || ""))
    || null;
}

function teamMap(series) {
  return new Map((series?.teams || []).map((team) => [String(team.id), team]));
}

function teamName(teams, id) {
  return clean(teams.get(String(id))?.name);
}

function heroesFromRows(game, side) {
  return (Array.isArray(game?.rows) ? game.rows : [])
    .slice(0, 5)
    .map((row) => clean(row?.[side]?.hero));
}

function overlayFor(overlay, seriesId, gameId) {
  const item = overlay?.banGames?.[`${seriesId}::${gameId}`];
  return {
    left: Array.isArray(item?.left) ? item.left.map(clean).filter(Boolean).slice(0, 5) : [],
    right: Array.isArray(item?.right) ? item.right.map(clean).filter(Boolean).slice(0, 5) : [],
  };
}

function countableGame(game, leftHeroes, rightHeroes) {
  if (!game || game.noData || game.conflict) return false;
  if (game.result !== "win" && game.result !== "lose") return false;
  if (leftHeroes.length !== 5 || rightHeroes.length !== 5) return false;
  if ([...leftHeroes, ...rightHeroes].some((hero) => !hero)) return false;
  return new Set([...leftHeroes, ...rightHeroes]).size === 10;
}

export function listMatchGamesForHeroStats({
  library = null,
  matches = null,
  manual = null,
  seriesId = "",
} = {}) {
  const series = selectedSeries(library, seriesId);
  if (!series) return { seriesId: clean(seriesId || library?.currentId), seriesName: "", games: [] };
  const teams = teamMap(series);
  const overlay = normalizeHeroStats(manual);
  const games = Array.isArray(matches?.games?.[series.id]) ? matches.games[series.id] : [];
  const rows = games.map((game, index) => {
    const leftHeroes = heroesFromRows(game, "our");
    const rightHeroes = heroesFromRows(game, "opp");
    const leftTeam = teamName(teams, game.ourId);
    const rightTeam = teamName(teams, game.oppId);
    const bans = overlayFor(overlay, series.id, game.id);
    const countable = !!leftTeam && !!rightTeam && countableGame(game, leftHeroes, rightHeroes);
    const missing = [];
    if (!leftTeam || !rightTeam) missing.push("队伍");
    if (leftHeroes.length !== 5 || leftHeroes.some((hero) => !hero)) missing.push("蓝方英雄");
    if (rightHeroes.length !== 5 || rightHeroes.some((hero) => !hero)) missing.push("红方英雄");
    if (game.result !== "win" && game.result !== "lose") missing.push("胜方");
    if (new Set([...leftHeroes, ...rightHeroes].filter(Boolean)).size !== [...leftHeroes, ...rightHeroes].filter(Boolean).length) {
      missing.push("英雄重复");
    }
    return {
      id: `${series.id}::${game.id}`,
      seriesId: String(series.id),
      seriesName: clean(series.name),
      gameId: String(game.id || ""),
      label: clean(game.label) || `第${index + 1}局`,
      matchKey: clean(game.matchKey),
      stage: "淘汰赛",
      group: "淘汰赛",
      round: clean(game.matchKey) || "未关联赛程",
      leftTeam,
      rightTeam,
      leftHeroes,
      rightHeroes,
      winner: game.result === "lose" ? "right" : game.result === "win" ? "left" : "",
      countable,
      missing,
      bans,
    };
  });
  return { seriesId: String(series.id), seriesName: clean(series.name), games: rows };
}

export function buildHeroStatsWithMatchData({
  library = null,
  matches = null,
  manual = null,
  seriesId = "",
} = {}) {
  const base = normalizeHeroStats(manual);
  const catalog = listMatchGamesForHeroStats({ library, matches, manual: base, seriesId });
  const bySeries = new Map();
  const clusters = { ...base.clusters };

  for (const item of catalog.games) {
    const bucketKey = [
      item.seriesId,
      item.matchKey || [item.leftTeam, item.rightTeam].sort().join("|"),
    ].join("|");
    if (!bySeries.has(bucketKey)) {
      bySeries.set(bucketKey, {
        id: `赛事数据-${bucketKey}`,
        sourceSeriesId: item.seriesId,
        stage: "淘汰赛",
        group: "淘汰赛",
        round: item.round,
        date: "",
        teams: [item.leftTeam, item.rightTeam],
        seriesScore: [0, 0],
        forfeit: false,
        noData: false,
        conflict: false,
        games: [],
      });
    }
    const target = bySeries.get(bucketKey);
    const picks = (heroes) => heroes.map((hero, index) => {
      if (!hero) return null;
      const cluster = manualCluster("pick", hero);
      clusters[cluster] = {
        ...(clusters[cluster] || {}),
        hero,
        confidence: 1,
        confirmed: true,
        source: "match-data",
        kind: "pick",
        sample: `/hicon/${encodeURIComponent(hero)}.jpg`,
      };
      return { order: [3, 4, 5, 9, 10][index] || index + 1, cluster };
    }).filter(Boolean);
    const banPicks = (heroes) => heroes.map((hero) => {
      const cluster = manualCluster("ban", hero);
      clusters[cluster] = {
        ...(clusters[cluster] || {}),
        hero,
        confidence: 1,
        confirmed: true,
        source: "manual-ban",
        kind: "ban",
        sample: `/hicon/${encodeURIComponent(hero)}.jpg`,
      };
      return { cluster };
    });
    const game = {
      id: item.gameId,
      matchKey: item.matchKey,
      no: target.games.length + 1,
      winner: item.winner,
      duration: "",
      noData: false,
      conflict: false,
      left: {
        team: item.leftTeam,
        side: "蓝方",
        picks: picks(item.leftHeroes),
        bans: banPicks(item.bans.left),
        players: [],
      },
      right: {
        team: item.rightTeam,
        side: "红方",
        picks: picks(item.rightHeroes),
        bans: banPicks(item.bans.right),
        players: [],
      },
    };
    target.games.push(game);
    if (item.winner === "left") target.seriesScore[0]++;
    if (item.winner === "right") target.seriesScore[1]++;
  }

  const combined = normalizeHeroStats({
    ...base,
    event: base.event || catalog.seriesName,
    series: [...base.series, ...Array.from(bySeries.values())],
    clusters,
  });
  return recountClusters(combined);
}

export function applyMatchBans(raw, input = {}, game = {}) {
  const data = normalizeHeroStats(raw);
  const seriesId = clean(input.seriesId || game.seriesId);
  const gameId = clean(input.gameId || game.gameId);
  if (!seriesId || !gameId || String(game.seriesId || seriesId) !== seriesId
    || String(game.gameId || gameId) !== gameId) {
    throw new Error("找不到要填写禁用数据的对局");
  }

  const cleanBans = (value, side) => {
    const list = (Array.isArray(value) ? value : []).map(clean).filter(Boolean).slice(0, 5);
    if (new Set(list).size !== list.length) throw new Error(`${side}禁用英雄不能重复`);
    return list;
  };
  const left = cleanBans(input.left, "左方");
  const right = cleanBans(input.right, "右方");
  const allBans = [...left, ...right];
  if (new Set(allBans).size !== allBans.length) throw new Error("双方禁用英雄不能重复");
  const picks = new Set([...(game.leftHeroes || []), ...(game.rightHeroes || [])].map(clean));
  const clash = allBans.find((hero) => picks.has(hero));
  if (clash) throw new Error(`英雄「${clash}」已在本局选择，不能同时选择为禁用`);

  const key = `${seriesId}::${gameId}`;
  if (!left.length && !right.length) delete data.banGames[key];
  else data.banGames[key] = {
    seriesId,
    gameId,
    left,
    right,
    updatedAt: new Date().toISOString(),
  };

  const sourceSeries = data.series.filter((series) => series.sourceSeriesId === seriesId);
  const sourceGame = sourceSeries
    .flatMap((series) => series.games)
    .find((item) => item.id === gameId);
  if (sourceGame) {
    sourceGame.left.bans = left.map((hero) => ({ cluster: manualCluster("ban", hero) }));
    sourceGame.right.bans = right.map((hero) => ({ cluster: manualCluster("ban", hero) }));
  }
  for (const hero of allBans) {
    const cluster = manualCluster("ban", hero);
    data.clusters[cluster] = {
      ...(data.clusters[cluster] || {}),
      hero,
      confidence: 1,
      confirmed: true,
      source: "manual-ban",
      kind: "ban",
      sample: `/hicon/${encodeURIComponent(hero)}.jpg`,
    };
  }
  data.updatedAt = new Date().toISOString();
  return recountClusters(data);
}
