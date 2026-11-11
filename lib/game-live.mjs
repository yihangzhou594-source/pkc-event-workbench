const box = (x, y, width, height, size) => ({ x, y, width, height, size });
const top = (y, height, size, scoreSize, left = 64, right = 1160) => [
  box(left, y, 760 - left, height, size), box(808, y, 116, height, scoreSize),
  box(right, y, 1856 - right, height, size), box(996, y, 116, height, scoreSize),
];

export const DEFAULT_GAME_BACKGROUND = "ipad-center";
export const GAME_BACKGROUNDS = [
  ["ipad-center", "中间4x3-iPad留位", "中间 4:3 iPad 留位", [360, 90, 1200, 900], [
    box(46, 219, 284, 151, 68), box(138, 560, 100, 105, 76),
    box(1590, 219, 284, 151, 68), box(1682, 560, 100, 105, 76),
  ]],
  ["ipad-top", "上下4x3-iPad留位", "上下 4:3 iPad 留位", [360, 96, 1200, 900], top(39, 35, 30, 34)],
  ["side", "左右留位", "左右留位", [240, 135, 1440, 810], [
    box(48, 218, 168, 145, 42), box(48, 512, 168, 242, 112),
    box(1704, 218, 168, 145, 42), box(1704, 512, 168, 242, 112),
  ]],
  ["top", "上方留位", "上方留位", [192, 170, 1536, 864], top(64, 67, 40, 60)],
  ["top-refined", "上方留位-精修版", "上方留位精修版", [192, 170, 1536, 864], top(49, 61, 40, 58)],
  ["ipad", "4x3-iPad", "4:3 iPad 原版", [240, 156, 1440, 810], top(84, 64, 35, 52, 260, 1160)],
  ["wide", "16x9-1920x1080", "16:9 原版", [192, 152, 1536, 864], top(77, 61, 36, 54)],
  ["bp", "16x9-1920x1080-BP留空-柔边版", "BP 留空柔边版", [192, 152, 1536, 864], top(95, 54, 36, 50)],
  ["bp-alpha", "16x9-1920x1080-BP留空-柔边透明底", "BP 留空柔边透明底", [192, 152, 1536, 864], top(95, 54, 36, 50)],
].map(([id, suffix, label, capture, slots]) => ({
  id, label, capture, slots,
  file: `直播间背景-${suffix}.png`,
  url: `/assets/live-background/${id}.png`,
}));

const idOf = (value) => String(value ?? "");
const hasScore = (value) => value != null && String(value).trim() !== "" && Number.isFinite(Number(value));

export function gameLiveSelectionKey(context) {
  return JSON.stringify([context?.seriesId, context?.matchKey, context?.gameId].map(idOf));
}

export function buildGameLive(context, library, matches, swapped = false) {
  const seriesId = idOf(context?.seriesId);
  const matchKey = idOf(context?.matchKey);
  const records = matches?.games?.[seriesId];
  const games = Array.isArray(records) ? records : [];
  const current = games.find((game) => context?.gameId && idOf(game.id) === idOf(context.gameId)
    && (!matchKey || idOf(game.matchKey) === matchKey));
  const contextPair = [idOf(context?.blueId), idOf(context?.redId)];
  const gamePair = [idOf(current?.ourId), idOf(current?.oppId)];
  const validPair = ([a, b]) => a && b && a !== b;
  const pair = validPair(gamePair) ? gamePair : contextPair;
  const assigned = Boolean(seriesId && matchKey && validPair(pair));
  if (!assigned) return { blue: { name: "蓝方", score: null }, red: { name: "红方", score: null }, assigned, swapped: false };

  const teams = library?.series?.find((series) => idOf(series.id) === seriesId)?.teams || [];
  const score = new Map(pair.map((id) => [id, 0]));
  const counted = new Set();
  for (const game of games) {
    if (idOf(game.matchKey) !== matchKey) continue;
    const sides = [idOf(game.ourId), idOf(game.oppId)];
    if (!validPair(sides) || !sides.every((id) => score.has(id))) continue;
    if (!hasScore(game.ourScore) || !hasScore(game.oppScore)) continue;
    const winner = game.result === "win" ? sides[0] : game.result === "lose" ? sides[1] : "";
    if (!winner || (game.id && counted.has(idOf(game.id)))) continue;
    if (game.id) counted.add(idOf(game.id));
    score.set(winner, score.get(winner) + 1);
  }
  const side = (id, fallback) => ({
    name: teams.find((team) => idOf(team.id) === id)?.name ||
      (id === contextPair[0] ? context?.blueTeam : id === contextPair[1] ? context?.redTeam : "") || fallback,
    score: score.get(id),
  });
  const [blueId, redId] = swapped ? [...pair].reverse() : pair;
  return { blue: side(blueId, "蓝方"), red: side(redId, "红方"), assigned, swapped };
}
