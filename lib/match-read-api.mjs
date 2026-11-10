import { chartNames } from "./game-chart-storage.mjs";
import { createHash, timingSafeEqual } from "node:crypto";

const metricKeys = [
  "k", "d", "a", "cs", "gold", "gpm", "goldShare", "rating", "dmgRaw",
  "tankRaw", "dmgPct", "tankPct", "kp", "dmgPerGold", "dmgWan",
];

function stored(value) {
  return (typeof value === "number" && Number.isFinite(value))
    || (typeof value === "string" && value.trim()) ? String(value) : null;
}

function gamePayload(game, series, includePlayers) {
  const rows = Array.isArray(game.rows) ? game.rows : [];
  function side(id, score, damage, playerKey, laneKey) {
    const team = series.teams?.find(team => String(team.id) === String(id));
    return {
      teamId: stored(id), teamName: stored(team?.name), score: stored(score),
      totalDamageWan: stored(damage),
      ...(includePlayers && { players: rows.map((row, index) => {
        const player = row?.[playerKey];
        return {
          slot: index + 1, name: stored(player?.name), hero: stored(player?.hero),
          lane: stored(row?.[laneKey]),
          metrics: Object.fromEntries(metricKeys.map(key => [key, stored(player?.[key])])),
        };
      }) }),
    };
  }
  return {
    id: String(game.id), seriesId: String(series.id), matchKey: stored(game.matchKey),
    label: stored(game.label), date: stored(game.date), duration: stored(game.duration),
    winner: game.result === "win" ? "blue" : game.result === "lose" ? "red" : null,
    blue: side(game.ourId, game.ourScore, game.dmgBlue, "our", "pos"),
    red: side(game.oppId, game.oppScore, game.dmgRed, "opp", "posOpp"),
  };
}

export function createMatchReadApi({ keyHashes, readData, sendJson, chartStorage, sendPng }) {
  const keys = (keyHashes || "").split(",").map(value => value.trim())
    .filter(value => /^[0-9a-f]{64}$/i.test(value)).map(value => Buffer.from(value, "hex"));

  return async function handle(req, res, url) {
    const match = /^\/api\/v1\/series(?:\/([^/]+)\/games(?:\/([^/]+)(\/charts(?:\/([a-z]+)\.png)?)?)?)?$/.exec(url.pathname);
    if (!match) return false;
    const reply = (status, payload) => {
      sendJson(res, payload, status);
      return true;
    };
    if (!keys.length) return reply(503, {error: "api_unavailable"});
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
    const digest = token && createHash("sha256").update(token).digest();
    if (!digest || !keys.some(key => timingSafeEqual(digest, key))) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return reply(401, {error: "invalid_api_key"});
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return reply(405, {error: "method_not_allowed"});
    }

    let seriesId, gameId;
    try {
      seriesId = match[1] && decodeURIComponent(match[1]);
      gameId = match[2] && decodeURIComponent(match[2]);
    } catch {
      return reply(400, {error: "invalid_id"});
    }
    const seriesList = (readData("library", {})?.series || []).filter(item => stored(item?.id));
    if (!seriesId) {
      return reply(200, {series: seriesList.map(item => ({id: String(item.id), name: stored(item.name)}))});
    }
    const series = seriesList.find(item => String(item.id) === seriesId);
    if (!series) return reply(404, {error: "series_not_found"});
    const bySeries = readData("matches", {})?.games || {};
    const games = (Object.hasOwn(bySeries, seriesId) && Array.isArray(bySeries[seriesId]) ? bySeries[seriesId] : [])
      .filter(game => stored(game?.id));
    if (gameId) {
      const game = games.find(item => String(item.id) === gameId);
      if (!game) return reply(404, {error: "game_not_found"});
      if (match[3]) {
        let bundle;
        try { bundle = await chartStorage.read(seriesId, gameId); }
        catch { return reply(503, {error: "chart_storage_unavailable"}); }
        if (!match[4]) return reply(200, {
          publishedAt: bundle?.publishedAt ?? null,
          charts: bundle ? chartNames.map(name => ({name, url: url.pathname + "/" + name + ".png"})) : [],
        });
        if (!chartNames.includes(match[4]) || !bundle?.images?.[match[4]]) {
          return reply(404, {error: "chart_not_found"});
        }
        sendPng(res, Buffer.from(bundle.images[match[4]], "base64"));
        return true;
      }
      return reply(200, {game: {...gamePayload(game, series, true), chartsUrl: url.pathname + "/charts"}});
    }

    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
      || !Number.isSafeInteger(offset) || offset < 0) return reply(400, {error: "invalid_pagination"});
    const matchKey = url.searchParams.get("matchKey");
    const filtered = matchKey === null ? games : games.filter(game => String(game.matchKey ?? "") === matchKey);
    return reply(200, {
      games: filtered.slice(offset, offset + limit).map(game => gamePayload(game, series, false)),
      total: filtered.length, limit, offset,
      nextOffset: offset + limit < filtered.length ? offset + limit : null,
    });
  };
}
