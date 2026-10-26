const GROUP_KEYS = ["A", "B", "C", "D"];
const ROUND_KEYS = [
  "R16-1", "R16-2", "R16-3", "R16-4", "R16-5", "R16-6", "R16-7", "R16-8",
  "WB1-1", "WB1-2", "WB1-3", "WB1-4", "WB2-1", "WB2-2", "WBF",
  "LB1-1", "LB1-2", "LB2-1", "LB2-2", "LB3", "LBF", "GF", "GF2",
];
const ROUND_NAMES = {
  r16: "16强", wb1: "胜者组八强", wb2: "胜者组半决赛", wbf: "胜者组决赛",
  lb1: "败者组第一轮", lb2: "败者组第二轮", lb3: "败者组半决赛", lbf: "败者组决赛",
  gf: "总决赛", gf2: "总决赛加赛",
};

const normName = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\u200b-\u200f\ufeff]/g, "")
  .replace(/\s+/g, "")
  .trim()
  .toLocaleLowerCase();

const text = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const pct = (wins, games) => games > 0 ? Math.round((wins / games) * 1000) / 10 : null;
const clampScore = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

function clusterName(item, kind) {
  const raw = String(item?.cluster || "");
  const prefix = `manual-${kind}-`;
  if (!raw.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(raw.slice(prefix.length)).trim();
  } catch {
    return "";
  }
}

function officialFromHeroSeries(series, teamNames) {
  const scores = Array.isArray(series?.seriesScore)
    ? series.seriesScore.map(clampScore)
    : [null, null];
  const [leftScore, rightScore] = scores;
  if (leftScore === null || rightScore === null || (leftScore === 0 && rightScore === 0 && !series?.forfeit)) {
    return null;
  }
  const left = String(series?.teams?.[0] || "");
  const right = String(series?.teams?.[1] || "");
  if (!teamNames.has(normName(left)) || !teamNames.has(normName(right))) return null;
  const winner = leftScore > rightScore ? left : rightScore > leftScore ? right : "";
  return {
    key: "group:" + String(series.id || [left, right, series.round].join(":")),
    stage: "group",
    round: String(series.round || "小组赛"),
    group: String(series.group || ""),
    date: String(series.date || ""),
    left,
    right,
    leftScore,
    rightScore,
    score: [leftScore, rightScore],
    winner,
    forfeit: !!series.forfeit,
    source: "heroStats",
  };
}

function bracketTree(bracket) {
  const draw = Array.isArray(bracket?.draw) ? bracket.draw : [];
  const win = bracket?.win || {};
  const score = bracket?.score || {};
  const matches = new Map();
  const winnerOf = (key) => {
    const match = matches.get(key);
    if (!match) return "";
    const won = win[key];
    if (won === "a" || won === "b") return won === "a" ? match.a : match.b;
    if (match.leftScore !== null && match.rightScore !== null && match.leftScore !== match.rightScore) {
      return match.leftScore > match.rightScore ? match.a : match.b;
    }
    return "";
  };
  const loserOf = (key) => {
    const match = matches.get(key);
    if (!match) return "";
    const won = win[key];
    if (won === "a" || won === "b") return won === "a" ? match.b : match.a;
    if (match.leftScore !== null && match.rightScore !== null && match.leftScore !== match.rightScore) {
      return match.leftScore > match.rightScore ? match.b : match.a;
    }
    return "";
  };
  const add = (key, round, a, b) => {
    const sc = score[key] || {};
    const item = {
      key,
      round,
      a: a || "",
      b: b || "",
      leftScore: clampScore(sc.a),
      rightScore: clampScore(sc.b),
    };
    matches.set(key, item);
  };
  for (let i = 0; i < 8; i++) add(`R16-${i + 1}`, "r16", draw[i]?.a, draw[i]?.b);
  add("WB1-1", "wb1", winnerOf("R16-1"), winnerOf("R16-2"));
  add("WB1-2", "wb1", winnerOf("R16-3"), winnerOf("R16-4"));
  add("WB1-3", "wb1", winnerOf("R16-5"), winnerOf("R16-6"));
  add("WB1-4", "wb1", winnerOf("R16-7"), winnerOf("R16-8"));
  add("WB2-1", "wb2", winnerOf("WB1-1"), winnerOf("WB1-2"));
  add("WB2-2", "wb2", winnerOf("WB1-3"), winnerOf("WB1-4"));
  add("WBF", "wbf", winnerOf("WB2-1"), winnerOf("WB2-2"));
  add("LB1-1", "lb1", loserOf("WB1-1"), loserOf("WB1-2"));
  add("LB1-2", "lb1", loserOf("WB1-3"), loserOf("WB1-4"));
  add("LB2-1", "lb2", winnerOf("LB1-1"), loserOf("WB2-1"));
  add("LB2-2", "lb2", winnerOf("LB1-2"), loserOf("WB2-2"));
  add("LB3", "lb3", winnerOf("LB2-1"), winnerOf("LB2-2"));
  add("LBF", "lbf", winnerOf("LB3"), loserOf("WBF"));
  add("GF", "gf", winnerOf("WBF"), winnerOf("LBF"));
  add("GF2", "gf2", winnerOf("GF"), loserOf("GF"));
  return { matches, winnerOf, loserOf };
}

function officialFromBracket(bracket, teamById) {
  const tree = bracketTree(bracket);
  const output = [];
  for (const key of ROUND_KEYS) {
    const match = tree.matches.get(key);
    if (!match || !match.a || !match.b) continue;
    const hasScore = match.leftScore !== null || match.rightScore !== null;
    const wonSide = bracket?.win?.[key];
    if (!hasScore && wonSide !== "a" && wonSide !== "b") continue;
    const left = teamById.get(String(match.a))?.name || "";
    const right = teamById.get(String(match.b))?.name || "";
    if (!left || !right) continue;
    const winnerSide = wonSide === "a" || wonSide === "b" ? wonSide
      : match.leftScore > match.rightScore ? "a" : match.rightScore > match.leftScore ? "b" : "";
    output.push({
      key,
      stage: "knockout",
      round: ROUND_NAMES[match.round] || match.round,
      group: "",
      date: "",
      left,
      right,
      leftScore: match.leftScore,
      rightScore: match.rightScore,
      score: [match.leftScore, match.rightScore],
      winner: winnerSide ? (winnerSide === "a" ? left : right) : "",
      forfeit: false,
      source: "bracket",
    });
  }
  const totalScheduled = Array.from(tree.matches.values()).filter((match) => match.a && match.b).length;
  const drawTeams = new Set((Array.isArray(bracket?.draw) ? bracket.draw : [])
    .flatMap((match) => [match?.a, match?.b])
    .filter(Boolean)
    .map(String));
  const losses = new Map();
  const eliminated = new Set();
  for (const key of ROUND_KEYS) {
    const match = tree.matches.get(key);
    if (!match || !tree.winnerOf(key)) continue;
    const loserId = tree.loserOf(key);
    if (!loserId) continue;
    losses.set(loserId, (losses.get(loserId) || 0) + 1);
    if (match.round === "r16" || match.round === "lbf" || match.round === "gf2" || losses.get(loserId) >= 2) {
      eliminated.add(loserId);
    }
  }
  return {
    matches: output,
    totalScheduled,
    remainingTeams: Math.max(0, drawTeams.size - eliminated.size),
    champion: tree.winnerOf("GF2") ? teamById.get(tree.winnerOf("GF2"))?.name || "" : tree.winnerOf("GF") ? teamById.get(tree.winnerOf("GF"))?.name || "" : "",
  };
}

export function listBracketMatches(bracket, teams = []) {
  const tree = bracketTree(bracket);
  const byId = new Map(teams.map((team) => [String(team.id), team]));
  return ROUND_KEYS.map((key) => {
    const match = tree.matches.get(key);
    if (!match?.a || !match?.b) return null;
    return {
      matchKey: key,
      round: match.round,
      roundLabel: ROUND_NAMES[match.round] || match.round,
      blueId: String(match.a),
      redId: String(match.b),
      blueName: byId.get(String(match.a))?.name || "",
      redName: byId.get(String(match.b))?.name || "",
    };
  }).filter(Boolean);
}

function officialFromMatches(games, teamById) {
  const grouped = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    if (!game?.matchKey || game.result !== "win" && game.result !== "lose") continue;
    const left = teamById.get(String(game.ourId))?.name || "";
    const right = teamById.get(String(game.oppId))?.name || "";
    if (!left || !right) continue;
    const item = grouped.get(game.matchKey) || {
      key: game.matchKey, stage: "knockout", round: game.matchKey, group: "", date: "",
      left, right, leftWins: 0, rightWins: 0, source: "matches",
    };
    if (item.left !== left || item.right !== right) continue;
    if (game.result === "win") item.leftWins += 1;
    else item.rightWins += 1;
    grouped.set(game.matchKey, item);
  }
  return Array.from(grouped.values()).map((item) => ({
    key: item.key, stage: item.stage, round: item.round, group: item.group, date: item.date,
    left: item.left, right: item.right,
    leftScore: item.leftWins, rightScore: item.rightWins,
    score: [item.leftWins, item.rightWins],
    winner: item.leftWins > item.rightWins ? item.left : item.rightWins > item.leftWins ? item.right : "",
    forfeit: false, source: item.source,
  }));
}

function emptyHero(hero) {
  return { hero, picks: 0, bans: 0, wins: 0, teams: new Set(), teamPicks: new Map() };
}

function addHeroPick(heroMap, hero, won, team) {
  if (!hero) return;
  const row = heroMap.get(hero) || emptyHero(hero);
  row.picks += 1;
  if (won) row.wins += 1;
  if (team) {
    row.teams.add(team);
    row.teamPicks.set(team, (row.teamPicks.get(team) || 0) + 1);
  }
  heroMap.set(hero, row);
}

function addHeroBan(heroMap, hero, team) {
  if (!hero) return;
  const row = heroMap.get(hero) || emptyHero(hero);
  row.bans += 1;
  if (team) row.teams.add(team);
  heroMap.set(hero, row);
}

function playerKey(team, player) {
  return normName(team) + "|" + normName(player);
}

function addPlayerSide({ side, sideName, winnerSide, teamName, playerMap, heroMap, picks }) {
  const won = sideName === winnerSide;
  const heroes = Array.isArray(side?.picks) ? side.picks.map((item) => clusterName(item, "pick")) : [];
  const bans = Array.isArray(side?.bans) ? side.bans.map((item) => clusterName(item, "ban")) : [];
  heroes.forEach((hero) => addHeroPick(heroMap, hero, won, teamName));
  bans.forEach((hero) => addHeroBan(heroMap, hero, teamName));
  if (teamName) {
    const key = playerKey(teamName, teamName);
    const row = playerMap.get(key) || {
      player: teamName, team: teamName, games: 0, wins: 0, heroMap: new Map(), order: playerMap.size,
    };
    row.games += 1;
    if (won) row.wins += 1;
    heroes.filter(Boolean).forEach((hero) => {
      const heroRow = row.heroMap.get(hero) || { hero, games: 0, wins: 0 };
      heroRow.games += 1;
      if (won) heroRow.wins += 1;
      row.heroMap.set(hero, heroRow);
    });
    playerMap.set(key, row);
  }
  picks.push(...heroes);
}

function processHeroGame(game, teamNames, playerMap, heroMap, stats) {
  if (!game) return;
  if (game.noData) stats.noDataGames += 1;
  if (game.conflict) stats.conflictGames += 1;
  if (game.noData || game.conflict) return;
  const left = game.left, right = game.right;
  const picks = [];
  if (!left || !right || game.winner !== "left" && game.winner !== "right") {
    stats.missingGames += 1;
    return;
  }
  const leftTeam = String(left.team || "");
  const rightTeam = String(right.team || "");
  if (!teamNames.has(normName(leftTeam)) || !teamNames.has(normName(rightTeam))) {
    stats.warnings.push({ code: "unknown_team", message: `无法匹配队伍：${leftTeam} / ${rightTeam}` });
    return;
  }
  addPlayerSide({ side: left, sideName: "left", winnerSide: game.winner, teamName: leftTeam, playerMap, heroMap, picks });
  addPlayerSide({ side: right, sideName: "right", winnerSide: game.winner, teamName: rightTeam, playerMap, heroMap, picks });
  if (picks.length !== 10 || picks.some((hero) => !hero) || new Set(picks).size !== 10) {
    stats.missingGames += 1;
    return;
  }
  stats.validGames += 1;
}

function processMatchGame(game, teamById, playerMap, heroMap, stats) {
  if (!game || game.result !== "win" && game.result !== "lose" && game.result !== "draw") return;
  const leftTeam = teamById.get(String(game.ourId))?.name || "";
  const rightTeam = teamById.get(String(game.oppId))?.name || "";
  const rows = Array.isArray(game.rows) ? game.rows : [];
  const leftRows = rows.map((row) => row?.our).filter(Boolean);
  const rightRows = rows.map((row) => row?.opp).filter(Boolean);
  const heroes = [...leftRows, ...rightRows].map((player) => String(player.hero || "").trim());
  if (!leftTeam || !rightTeam || leftRows.length !== 5 || rightRows.length !== 5
    || heroes.some((hero) => !hero) || new Set(heroes).size !== 10) {
    stats.missingGames += 1;
    return;
  }
  const winnerSide = game.result === "win" ? "left" : game.result === "lose" ? "right" : "";
  if (!winnerSide) {
    stats.missingGames += 1;
    return;
  }
  const left = {
    team: leftTeam,
    players: leftRows.map((row) => ({ name: row.name })),
    picks: leftRows.map((row) => ({ cluster: "manual-pick-" + encodeURIComponent(row.hero) })),
    bans: [],
  };
  const right = {
    team: rightTeam,
    players: rightRows.map((row) => ({ name: row.name })),
    picks: rightRows.map((row) => ({ cluster: "manual-pick-" + encodeURIComponent(row.hero) })),
    bans: [],
  };
  const before = stats.validGames;
  const picks = [];
  addPlayerSide({ side: left, sideName: "left", winnerSide, teamName: leftTeam, playerMap, heroMap, picks });
  addPlayerSide({ side: right, sideName: "right", winnerSide, teamName: rightTeam, playerMap, heroMap, picks });
  if (new Set(picks).size === 10) stats.validGames += 1;
  if (stats.validGames === before) stats.missingGames += 1;
}

export function buildSeasonInsights({
  library = null,
  matches = null,
  bracket = null,
  heroStats = null,
  seriesId = "",
  context = null,
  stage = "all",
  leftId = "",
  rightId = "",
} = {}) {
  const stageFilter = ["group", "knockout"].includes(stage) ? stage : "all";
  const series = (library?.series || []).find((item) => String(item.id) === String(seriesId || library?.currentId))
    || (library?.series || [])[0]
    || { id: "", name: "", teams: [] };
  const id = String(series.id || "");
  const teams = Array.isArray(series.teams) ? series.teams : [];
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const teamNames = new Set(teams.map((team) => normName(team.name)));
  const dataQuality = {
    validGames: 0,
    noDataGames: 0,
    conflictGames: 0,
    missingGames: 0,
    warnings: [],
  };

  const uniqueStats = new Map();
  for (const item of Array.isArray(heroStats?.series) ? heroStats.series : []) {
    const isKnockout = /淘汰|knockout/i.test(String(item?.stage || ""));
    if (stageFilter === "group" && isKnockout) continue;
    if (stageFilter === "knockout" && !isKnockout) continue;
    const key = String(item?.id || [item?.stage, item?.group, item?.round, ...(item?.teams || [])].join("|"));
    if (!uniqueStats.has(key)) uniqueStats.set(key, item);
  }
  const groupOfficials = [];
  for (const item of uniqueStats.values()) {
    const official = officialFromHeroSeries(item, teamNames);
    if (official) groupOfficials.push(official);
  }
  const bracketInfo = stageFilter === "group"
    ? { matches: [], totalScheduled: 0, remainingTeams: teams.filter((team) => !team.eliminated).length, champion: "" }
    : officialFromBracket(bracket?.[id] || {}, teamById);
  const matchFallback = (stageFilter === "group" ? [] : officialFromMatches(matches?.games?.[id] || [], teamById))
    .filter((item) => !bracketInfo.matches.some((bracketItem) => bracketItem.key === item.key
      && bracketItem.winner));
  const officialMatches = [...groupOfficials, ...bracketInfo.matches, ...matchFallback];

  const teamMap = new Map(teams.map((team) => [String(team.id), {
    id: String(team.id), name: String(team.name || ""), group: String(team.group || ""),
    wins: 0, losses: 0, gameWins: 0, gameLosses: 0, recentForm: [], sources: new Set(),
  }]));
  const nameToTeam = new Map(teams.map((team) => [normName(team.name), teamMap.get(String(team.id))]));
  for (const result of officialMatches) {
    const left = nameToTeam.get(normName(result.left));
    const right = nameToTeam.get(normName(result.right));
    if (!left || !right || !result.winner) continue;
    const winner = nameToTeam.get(normName(result.winner));
    const loser = winner === left ? right : left;
    winner.wins += 1;
    loser.losses += 1;
    if (result.leftScore !== null) {
      left.gameWins += result.leftScore;
      right.gameLosses += result.leftScore;
    }
    if (result.rightScore !== null) {
      right.gameWins += result.rightScore;
      left.gameLosses += result.rightScore;
    }
    winner.recentForm.push("W");
    loser.recentForm.push("L");
    winner.sources.add(result.source);
    loser.sources.add(result.source);
  }

  const playerMap = new Map();
  const heroMap = new Map();
  for (const item of uniqueStats.values()) {
    for (const game of Array.isArray(item.games) ? item.games : []) {
      processHeroGame(game, teamNames, playerMap, heroMap, dataQuality);
    }
  }
  if (stageFilter !== "group") {
    for (const game of Array.isArray(matches?.games?.[id]) ? matches.games[id] : []) {
      processMatchGame(game, teamById, playerMap, heroMap, dataQuality);
    }
  }

  const heroRows = Array.from(heroMap.values()).map((hero) => ({
    hero: hero.hero,
    picks: hero.picks,
    bans: hero.bans,
    wins: hero.wins,
    winRate: pct(hero.wins, hero.picks),
    pickRate: dataQuality.validGames ? Math.round((hero.picks / (dataQuality.validGames * 2)) * 1000) / 10 : null,
    banRate: dataQuality.validGames ? Math.round((hero.bans / (dataQuality.validGames * 2)) * 1000) / 10 : null,
    presenceRate: dataQuality.validGames ? Math.round(((hero.picks + hero.bans) / (dataQuality.validGames * 2)) * 1000) / 10 : null,
    teams: Array.from(hero.teams),
    teamPicks: Array.from(hero.teamPicks.entries()).map(([team, picks]) => ({ team, picks })).sort((a, b) => b.picks - a.picks),
    smallSample: hero.picks > 0 && hero.picks < 3,
  })).sort((a, b) => b.presenceRate - a.presenceRate || b.picks - a.picks || a.hero.localeCompare(b.hero, "zh-CN"));

  const players = Array.from(playerMap.values()).map((player) => ({
    player: player.player,
    team: player.team,
    games: player.games,
    wins: player.wins,
    winRate: pct(player.wins, player.games),
    smallSample: player.games > 0 && player.games < 2,
    order: player.order,
    heroes: Array.from(player.heroMap.values())
      .map((hero) => ({ ...hero, winRate: pct(hero.wins, hero.games) }))
      .sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.hero.localeCompare(b.hero, "zh-CN")),
  })).sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.player.localeCompare(b.player, "zh-CN"));

  for (const team of teamMap.values()) {
    team.recentForm = team.recentForm.slice(-5);
    team.winRate = pct(team.wins, team.wins + team.losses);
    team.gameDiff = team.gameWins - team.gameLosses;
    team.sources = Array.from(team.sources);
  }
  const rankTeams = (items) => items.slice().sort((a, b) =>
    b.wins - a.wins || a.losses - b.losses || b.gameDiff - a.gameDiff || a.name.localeCompare(b.name, "zh-CN")
  ).map((team, index) => ({ ...team, rank: index + 1 }));
  const teamList = rankTeams(Array.from(teamMap.values()));
  const groups = GROUP_KEYS.map((key) => {
    const groupTeams = teamList.filter((team) => {
      const raw = String(team.group || "").replace(/\s+/g, "").toUpperCase();
      return raw === key || raw === key + "组" || raw === (key === "A" ? "一" : key === "B" ? "二" : key === "C" ? "三" : "四") + "组";
    });
    return { key, name: key + "组", teams: groupTeams };
  }).filter((group) => group.teams.length);

  const preferredLeftId = String(leftId || context?.blueId || teams[0]?.id || "");
  const selectedLeftId = teamById.has(preferredLeftId) ? preferredLeftId : String(teams[0]?.id || "");
  const preferredRightId = String(rightId || context?.redId || teams.find((team) => team.id !== selectedLeftId)?.id || "");
  const selectedRightId = teamById.has(preferredRightId) && preferredRightId !== selectedLeftId
    ? preferredRightId
    : String(teams.find((team) => team.id !== selectedLeftId)?.id || "");
  const leftName = teamById.get(selectedLeftId)?.name || "";
  const rightName = teamById.get(selectedRightId)?.name || "";
  const meetings = officialMatches.filter((item) =>
    [item.left, item.right].every((name) => [leftName, rightName].map(normName).includes(normName(name)))
  );

  const mvp = players.map((player) => ({
    player: player.player,
    team: player.team,
    games: player.games,
    wins: player.wins,
    score: player.games * 1000 + player.wins,
    order: player.order,
  })).sort((a, b) => b.score - a.score || b.wins - a.wins || a.order - b.order).slice(0, 5)
    .map(({ order, ...mvpPlayer }) => mvpPlayer);

  if (!officialMatches.length) dataQuality.warnings.push({ code: "no_official_results", message: "还没有可汇总的官方赛果" });
  if (!dataQuality.validGames) dataQuality.warnings.push({ code: "no_hero_games", message: "还没有完整的英雄与队伍数据" });

  return {
    meta: {
      seriesId: id,
      seriesName: String(series.name || ""),
      generatedAt: new Date().toISOString(),
      stageFilter,
      officialMatches: officialMatches.length,
      forfeitMatches: officialMatches.filter((item) => item.forfeit).length,
      champion: bracketInfo.champion,
      remainingTeams: bracketInfo.remainingTeams,
      stageProgress: {
        completed: bracketInfo.matches.filter((item) => item.winner).length,
        total: bracketInfo.totalScheduled || bracketInfo.matches.length,
      },
    },
    dataQuality,
    groups,
    teams: teamList,
    officialMatches,
    headToHead: { leftId: selectedLeftId, rightId: selectedRightId, leftName, rightName, meetings },
    players,
    heroes: heroRows,
    mvp,
    warnings: dataQuality.warnings,
  };
}

export { normName as normalizeSeasonName };
