/**
 * 英雄使用与胜率：数据模型、口径与聚合。
 *
 * 设计要点：
 * - 选择/禁用只存“图像簇 hash”，英雄名在 clusters 里维护；
 *   这样确认一次头像，全赛事所有同簇出场自动跟着变。
 * - 判负/弃权局没有备战数据，noData=true，不进任何分母。
 * - 所有聚合都是纯函数，方便单测，也方便以后淘汰赛直接追加。
 */

export const HERO_STATS_VERSION = 1;
export const DEFAULT_EVENT = "2026PKC秋季赛";
export const DEFAULT_STAGE = "循环赛";

const emptyData = () => ({
  version: HERO_STATS_VERSION,
  event: DEFAULT_EVENT,
  stage: DEFAULT_STAGE,
  capturedAt: "",
  updatedAt: "",
  series: [],
  clusters: {},
});

export function normalizeHeroStats(raw) {
  const out = emptyData();
  if (!raw || typeof raw !== "object") return out;
  out.version = Number(raw.version) || HERO_STATS_VERSION;
  out.event = String(raw.event || DEFAULT_EVENT);
  out.stage = String(raw.stage || DEFAULT_STAGE);
  out.capturedAt = String(raw.capturedAt || "");
  out.updatedAt = String(raw.updatedAt || "");
  out.clusters = normalizeClusters(raw.clusters);
  out.series = Array.isArray(raw.series) ? raw.series.map(normalizeSeries).filter(Boolean) : [];
  return out;
}

function normalizeClusters(src) {
  const out = {};
  if (!src || typeof src !== "object") return out;
  for (const [hash, v] of Object.entries(src)) {
    if (!hash || !v || typeof v !== "object") continue;
    out[String(hash)] = {
      hero: v.hero ? String(v.hero) : "",
      confidence: Number.isFinite(Number(v.confidence)) ? Number(v.confidence) : 0,
      confirmed: !!v.confirmed,
      source: String(v.source || ""),
      count: Number(v.count) || 0,
      sample: String(v.sample || ""),
      firstSeen: String(v.firstSeen || ""),
      kind: String(v.kind || "pick"),
    };
  }
  return out;
}

function normalizeSeries(src) {
  if (!src || typeof src !== "object") return null;
  const teams = Array.isArray(src.teams) ? src.teams.map((x) => String(x || "")) : [];
  if (teams.length !== 2 || !teams[0] || !teams[1]) return null;
  const games = Array.isArray(src.games) ? src.games.map(normalizeGame).filter(Boolean) : [];
  const id = String(src.id || seriesId({
    stage: src.stage,
    group: src.group,
    round: src.round,
    teams,
  }));
  return {
    id,
    stage: String(src.stage || DEFAULT_STAGE),
    group: String(src.group || ""),
    round: String(src.round || ""),
    date: String(src.date || ""),
    teams,
    seriesScore: Array.isArray(src.seriesScore)
      ? [Number(src.seriesScore[0]) || 0, Number(src.seriesScore[1]) || 0]
      : [0, 0],
    forfeit: !!src.forfeit,
    noData: !!src.noData,
    conflict: !!src.conflict,
    games,
  };
}

function normalizeGame(src) {
  if (!src || typeof src !== "object") return null;
  const side = (s, team) => ({
    team: String((s && s.team) || team || ""),
    side: String((s && s.side) || ""),
    picks: Array.isArray(s && s.picks) ? s.picks.map(normalizePick).filter(Boolean) : [],
    bans: Array.isArray(s && s.bans) ? s.bans.map(normalizeBan).filter(Boolean) : [],
    players: Array.isArray(s && s.players) ? s.players.map(normalizePlayer).filter(Boolean) : [],
  });
  return {
    no: Number(src.no) || 0,
    winner: src.winner === "left" || src.winner === "right" || src.winner === "draw" ? src.winner : "",
    duration: String(src.duration || ""),
    noData: !!src.noData,
    conflict: !!src.conflict,
    left: side(src.left, src.teamLeft),
    right: side(src.right, src.teamRight),
  };
}

function normalizePick(src) {
  if (!src || typeof src !== "object") return null;
  const cluster = String(src.cluster || src.hash || "");
  if (!cluster) return null;
  return { order: Number(src.order) || 0, cluster };
}

function normalizeBan(src) {
  if (!src || typeof src !== "object") return null;
  const cluster = String(src.cluster || src.hash || "");
  if (!cluster) return null;
  return { cluster };
}

function normalizePlayer(src) {
  if (!src || typeof src !== "object") return null;
  const name = String(src.name || "").trim();
  if (!name) return null;
  return { name, cluster: String(src.cluster || src.hash || "") };
}

export function seriesId({ stage, group, round, teams }) {
  return [stage || DEFAULT_STAGE, group || "", round || "", ...(teams || [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("-");
}

export function manualCluster(kind, hero) {
  return `manual-${kind}-${encodeURIComponent(String(hero || "").trim())}`;
}

/**
 * 手动录入一局。返回 { data, seriesId, gameNo, replaced, mergedInto }。
 * bans 允许 0-5 个；picks 必须 5 个英雄，选手名可以为空。
 */
export function addManualGame(raw, input) {
  const data = normalizeHeroStats(raw);
  const stage = String(input.stage || "循环赛").trim();
  const group = String(input.group || "").trim();
  const round = String(input.round || "").trim();
  const date = String(input.date || "").trim();
  const gameNo = Math.max(1, Math.min(7, Number(input.gameNo) || 1));
  const teamLeft = String(input.teamLeft || "").trim();
  const teamRight = String(input.teamRight || "").trim();
  const winner = input.winner === "right" ? "right" : input.winner === "left" ? "left" : "";
  if (!teamLeft || !teamRight) throw new Error("左右队名都要填");
  if (teamLeft === teamRight) throw new Error("左右队名不能相同");
  if (!winner) throw new Error("请选择胜方");

  const side = (obj, team) => {
    const bans = (Array.isArray(obj && obj.bans) ? obj.bans : [])
      .map((h) => String(h || "").trim()).filter(Boolean);
    const players = (Array.isArray(obj && obj.players) ? obj.players : [])
      .slice(0, 5).map((p) => ({
        name: String(p && p.name || "").trim(),
        hero: String(p && p.hero || "").trim(),
      }));
    while (players.length < 5) players.push({ name: "", hero: "" });
    if (players.some((p) => !p.hero)) throw new Error(`${team} 的 5 个选择英雄都要填`);
    const heroes = players.map((p) => p.hero);
    if (new Set(heroes).size !== 5) throw new Error(`${team} 有重复选择的英雄`);
    return { team, bans, players };
  };
  const left = side(input.left, teamLeft);
  const right = side(input.right, teamRight);
  const allPicks = [...left.players, ...right.players].map((p) => p.hero);
  if (new Set(allPicks).size !== 10) throw new Error("双方合计 10 个选择英雄不能重复");
  const allBans = new Set([...left.bans, ...right.bans]);
  for (const h of allPicks) if (allBans.has(h)) throw new Error(`英雄「${h}」被禁用后又被选择`);

  const pick = (hero) => manualCluster("pick", hero);
  const ban = (hero) => manualCluster("ban", hero);
  const orders = [3, 4, 5, 9, 10];
  const game = {
    no: gameNo,
    winner,
    duration: "",
    noData: false,
    left: {
      team: teamLeft, side: "蓝方",
      picks: left.players.map((p, i) => ({ order: orders[i] || i + 1, cluster: pick(p.hero) })),
      bans: left.bans.map((h) => ({ cluster: ban(h) })),
      players: left.players.map((p) => ({ name: p.name, cluster: pick(p.hero) })),
    },
    right: {
      team: teamRight, side: "红方",
      picks: right.players.map((p, i) => ({ order: orders[i] || i + 1, cluster: pick(p.hero) })),
      bans: right.bans.map((h) => ({ cluster: ban(h) })),
      players: right.players.map((p) => ({ name: p.name, cluster: pick(p.hero) })),
    },
  };

  const existing = data.series.find((s) =>
    s.stage === stage && s.group === group && s.round === round &&
    s.teams[0] === teamLeft && s.teams[1] === teamRight);
  const sid = existing ? existing.id : "手动-" + seriesId({ stage, group, round, teams: [teamLeft, teamRight] });
  let replaced = false;
  if (existing) {
    const idx = existing.games.findIndex((g) => g.no === gameNo);
    if (idx >= 0) { existing.games[idx] = game; replaced = true; }
    else existing.games.push(game);
  } else {
    data.series.push({
      id: sid, stage, group, round, date, teams: [teamLeft, teamRight],
      seriesScore: [0, 0], forfeit: false, noData: false, conflict: false, games: [game],
    });
  }
  const s = data.series.find((x) => x.id === sid);
  s.games.sort((a, b) => a.no - b.no);
  s.seriesScore = [
    s.games.filter((g) => g.winner === "left").length,
    s.games.filter((g) => g.winner === "right").length,
  ];
  s.date = s.date || date;

  for (const h of left.players.concat(right.players).map((p) => p.hero)) {
    const cid = pick(h);
    data.clusters[cid] = {
      ...(data.clusters[cid] || {}),
      hero: h, confidence: 1, confirmed: true, source: "manual", kind: "pick",
      sample: "/hicon/" + encodeURIComponent(h) + ".jpg",
    };
  }
  for (const h of left.bans.concat(right.bans)) {
    const cid = ban(h);
    data.clusters[cid] = {
      ...(data.clusters[cid] || {}),
      hero: h, confidence: 1, confirmed: true, source: "manual", kind: "ban",
      sample: "/hicon/" + encodeURIComponent(h) + ".jpg",
    };
  }
  const out = recountClusters(data);
  out.updatedAt = new Date().toISOString();
  return { data: out, seriesId: sid, gameNo, replaced, mergedInto: !!existing };
}

export function clusterHero(data, hash) {
  const c = data && data.clusters ? data.clusters[hash] : null;
  return c && c.hero ? c.hero : "";
}

/** 只有“真实打完、双方各 5 个选择、10 个选择互不重复、有胜负”的局才进分母。 */
export function isCountableGame(game) {
  if (!game || game.noData || game.conflict) return false;
  if (game.winner !== "left" && game.winner !== "right") return false;
  const lp = game.left && game.left.picks ? game.left.picks : [];
  const rp = game.right && game.right.picks ? game.right.picks : [];
  if (lp.length !== 5 || rp.length !== 5) return false;
  const all = [...lp, ...rp].map((x) => x.cluster);
  if (all.some((x) => !x)) return false;
  if (new Set(all).size !== 10) return false;
  return true;
}

/** 校验一场的 bp 是否自洽；返回问题列表（空数组=没问题）。 */
export function validateGame(game) {
  const issues = [];
  if (!game) return ["empty game"];
  if (game.noData) return issues;
  const sides = ["left", "right"];
  const allPicks = [];
  for (const s of sides) {
    const picks = (game[s] && game[s].picks) || [];
    if (picks.length !== 5) issues.push(`${s} picks=${picks.length}`);
    picks.forEach((p) => allPicks.push(p.cluster));
    const bans = (game[s] && game[s].bans) || [];
    const banSet = new Set(bans.map((b) => b.cluster));
    for (const p of picks) {
      if (banSet.has(p.cluster)) issues.push(`${s} pick is also banned: ${p.cluster}`);
    }
  }
  if (new Set(allPicks).size !== allPicks.length) issues.push("duplicate pick across both teams");
  return issues;
}

export function mergeSeries(data, series) {
  const next = normalizeHeroStats(data);
  const s = normalizeSeries(series);
  if (!s) throw new Error("series 格式不正确");
  const idx = next.series.findIndex((x) => x.id === s.id);
  if (idx >= 0) next.series[idx] = s;
  else next.series.push(s);
  next.series.sort((a, b) => {
    const key = (x) => [x.stage, x.group, x.round, x.id].join("|");
    return key(a).localeCompare(key(b), "zh-CN");
  });
  next.updatedAt = new Date().toISOString();
  return next;
}

export function mergeClusters(data, incoming) {
  const next = normalizeHeroStats(data);
  const src = incoming && typeof incoming === "object" ? incoming : {};
  for (const [hash, v] of Object.entries(src)) {
    if (!hash || !v || typeof v !== "object") continue;
    const prev = next.clusters[hash] || {};
    next.clusters[hash] = {
      ...prev,
      ...v,
      hero: v.hero !== undefined ? String(v.hero || "") : String(prev.hero || ""),
      confidence: v.confidence !== undefined ? Number(v.confidence) || 0 : Number(prev.confidence) || 0,
      confirmed: v.confirmed !== undefined ? !!v.confirmed : !!prev.confirmed,
      source: v.source !== undefined ? String(v.source || "") : String(prev.source || ""),
      count: v.count !== undefined ? Number(v.count) || 0 : Number(prev.count) || 0,
      sample: v.sample !== undefined ? String(v.sample || "") : String(prev.sample || ""),
      firstSeen: v.firstSeen !== undefined ? String(v.firstSeen || "") : String(prev.firstSeen || ""),
      kind: v.kind !== undefined ? String(v.kind || "pick") : String(prev.kind || "pick"),
    };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function applyLabels(data, labels) {
  const next = normalizeHeroStats(data);
  const src = labels && typeof labels === "object" ? labels : {};
  for (const [hash, v] of Object.entries(src)) {
    if (!hash || !v || typeof v !== "object") continue;
    const prev = next.clusters[hash] || {};
    next.clusters[hash] = {
      ...prev,
      hero: String(v.hero || "").trim(),
      confidence: v.confidence !== undefined ? Number(v.confidence) || 0 : Number(prev.confidence) || 0,
      confirmed: v.confirmed !== undefined ? !!v.confirmed : true,
      source: String(v.source || prev.source || "manual"),
      count: Number(prev.count) || 0,
      sample: String(prev.sample || ""),
      firstSeen: String(prev.firstSeen || ""),
      kind: String(prev.kind || "pick"),
    };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/** 给新抓到的簇补 sample/count；不覆盖已有英雄名。 */
export function registerClusters(data, clusters) {
  const next = normalizeHeroStats(data);
  const src = clusters && typeof clusters === "object" ? clusters : {};
  for (const [hash, v] of Object.entries(src)) {
    if (!hash || !v) continue;
    const prev = next.clusters[hash] || {};
    next.clusters[hash] = {
      hero: String(prev.hero || v.hero || ""),
      confidence: Number(prev.confidence || v.confidence) || 0,
      confirmed: !!prev.confirmed,
      source: String(prev.source || v.source || ""),
      count: Number(prev.count || 0) + (Number(v.count) || 1),
      sample: String(prev.sample || v.sample || ""),
      firstSeen: String(prev.firstSeen || v.firstSeen || new Date().toISOString()),
      kind: String(prev.kind || v.kind || "pick"),
    };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/** 按当前 series 重算每个簇的出现次数；重复 ingest 不会把计数越加越大。 */
export function recountClusters(data) {
  const next = normalizeHeroStats(data);
  const counts = {};
  for (const s of next.series) {
    for (const g of s.games) {
      if (!g || g.noData) continue;
      for (const side of ["left", "right"]) {
        const sd = g[side];
        if (!sd) continue;
        for (const p of sd.picks || []) counts[p.cluster] = (counts[p.cluster] || 0) + 1;
        for (const b of sd.bans || []) counts[b.cluster] = (counts[b.cluster] || 0) + 1;
      }
    }
  }
  for (const [hash, c] of Object.entries(next.clusters)) {
    c.count = counts[hash] || 0;
    if (!c.count) delete next.clusters[hash];
  }
  return next;
}

function pct(n, d) {
  return d > 0 ? Number(((n / d) * 100).toFixed(1)) : null;
}

/**
 * 聚合。filters: { stage, group, team, player, includeAllStages }
 * - stage 为空或 "all" 表示全部阶段。
 * - minPicks 只影响英雄榜，不影响选手榜。
 */
export function aggregateHeroStats(raw, filters = {}) {
  const data = normalizeHeroStats(raw);
  const stage = filters.stage && filters.stage !== "all" ? String(filters.stage) : "";
  const group = filters.group && filters.group !== "all" ? String(filters.group) : "";
  const team = filters.team && filters.team !== "all" ? String(filters.team) : "";
  const player = filters.player && filters.player !== "all" ? String(filters.player) : "";
  const minPicks = Math.max(0, Number(filters.minPicks) || 0);

  const heroMap = new Map();
  const playerMap = new Map();
  let games = 0;
  let seriesCount = 0;
  let picksTotal = 0;
  let bansTotal = 0;
  let noDataGames = 0;
  let forfeitSeries = 0;
  const unresolved = new Set();
  const seriesRows = [];

  const heroRec = (hero) => {
    if (!heroMap.has(hero)) {
      heroMap.set(hero, {
        hero, picks: 0, wins: 0, bans: 0,
        teams: new Set(), players: new Set(), playerMap: new Map(),
      });
    }
    return heroMap.get(hero);
  };
  const playerRec = (teamName, name) => {
    const key = `${teamName}|${name}`;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        key, name, team: teamName, games: 0, wins: 0,
        heroes: new Map(), unresolved: 0,
      });
    }
    return playerMap.get(key);
  };

  for (const s of data.series) {
    if (stage && s.stage !== stage) continue;
    if (group && s.group !== group) continue;
    if (team && !s.teams.includes(team)) continue;
    if (player) {
      const hasPlayer = s.games.some((g) => ["left", "right"].some((side) =>
        (g[side].players || []).some((p) => p.name === player)));
      if (!hasPlayer) continue;
    }
    seriesCount++;
    if (s.forfeit) forfeitSeries++;
    const row = {
      id: s.id, stage: s.stage, group: s.group, round: s.round, date: s.date,
      teams: s.teams, seriesScore: s.seriesScore, forfeit: s.forfeit,
      games: 0, countable: 0, noData: 0,
    };
    for (const g of s.games) {
      row.games++;
      if (g.noData) { row.noData++; noDataGames++; continue; }
      if (!isCountableGame(g)) continue;
      row.countable++;
      games++;
      for (const side of ["left", "right"]) {
        const sd = g[side];
        const win = g.winner === side;
        for (const p of sd.picks) {
          const hero = clusterHero(data, p.cluster);
          if (!hero) { unresolved.add(p.cluster); continue; }
          picksTotal++;
          const h = heroRec(hero);
          h.picks++;
          if (win) h.wins++;
          h.teams.add(sd.team);
        }
        for (const b of sd.bans) {
          const hero = clusterHero(data, b.cluster);
          if (!hero) { unresolved.add(b.cluster); continue; }
          bansTotal++;
          heroRec(hero).bans++;
        }
        for (const p of sd.players) {
          const pr = playerRec(sd.team, p.name);
          pr.games++;
          if (win) pr.wins++;
          const hero = clusterHero(data, p.cluster);
          if (!hero) { pr.unresolved++; unresolved.add(p.cluster); continue; }
          const h = heroRec(hero);
          const heroPlayerKey = `${sd.team}|${p.name}`;
          if (!h.playerMap.has(heroPlayerKey)) {
            h.playerMap.set(heroPlayerKey, { name: p.name, team: sd.team, games: 0, wins: 0 });
          }
          const hp = h.playerMap.get(heroPlayerKey);
          hp.games++;
          if (win) hp.wins++;
          if (!pr.heroes.has(hero)) pr.heroes.set(hero, { hero, games: 0, wins: 0 });
          const ph = pr.heroes.get(hero);
          ph.games++;
          if (win) ph.wins++;
        }
      }
    }
    seriesRows.push(row);
  }

  const allHeroCount = heroMap.size;
  const heroes = Array.from(heroMap.values())
    .map((h) => {
      const topPlayers = Array.from(h.playerMap.values())
        .map((player) => ({ ...player, winRate: pct(player.wins, player.games) }))
        .sort((a, b) =>
          b.wins - a.wins ||
          (b.winRate ?? -1) - (a.winRate ?? -1) ||
          b.games - a.games ||
          a.name.localeCompare(b.name, "zh-CN"))
        .slice(0, 3);
      return {
        hero: h.hero,
        picks: h.picks,
        wins: h.wins,
        losses: h.picks - h.wins,
        winRate: pct(h.wins, h.picks),
        bans: h.bans,
        pickRate: pct(h.picks, games * 2),
        banRate: pct(h.bans, games * 2),
        presenceRate: pct(h.picks + h.bans, games * 2),
        teams: Array.from(h.teams).sort((a, b) => a.localeCompare(b, "zh-CN")),
        players: Array.from(h.players),
        topPlayers,
      };
    })
    .filter((h) => h.picks >= minPicks)
    .sort((a, b) => b.picks - a.picks || (b.winRate ?? -1) - (a.winRate ?? -1) || a.hero.localeCompare(b.hero, "zh-CN"));

  const players = Array.from(playerMap.values())
    .map((p) => {
      const heroRows = Array.from(p.heroes.values())
        .map((h) => ({ ...h, winRate: pct(h.wins, h.games) }));
      const topHeroes = heroRows
        .slice()
        .sort((a, b) =>
          (b.winRate ?? -1) - (a.winRate ?? -1) ||
          b.wins - a.wins ||
          b.games - a.games ||
          a.hero.localeCompare(b.hero, "zh-CN"))
        .slice(0, 3);
      return {
        key: p.key,
        name: p.name,
        team: p.team,
        games: p.games,
        wins: p.wins,
        winRate: pct(p.wins, p.games),
        unresolved: p.unresolved,
        heroes: heroRows
          .sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.hero.localeCompare(b.hero, "zh-CN")),
        topHeroes,
      };
    })
    .sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.name.localeCompare(b.name, "zh-CN"));

  const stages = Array.from(new Set(data.series.map((s) => s.stage))).filter(Boolean);
  const groups = Array.from(new Set(data.series.filter((s) => !stage || s.stage === stage).map((s) => s.group))).filter(Boolean);
  const teams = Array.from(new Set(data.series.flatMap((s) => s.teams))).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"));

  return {
    event: data.event,
    stage: stage || "all",
    filters: { stage: stage || "all", group: group || "all", team: team || "all", player: player || "all", minPicks },
    summary: {
      series: seriesCount,
      games,
      picks: picksTotal,
      bans: bansTotal,
      heroes: allHeroCount,
      players: players.length,
      noDataGames,
      forfeitSeries,
      unresolvedClusters: unresolved.size,
      capturedAt: data.capturedAt,
      updatedAt: data.updatedAt,
    },
    heroes,
    players,
    series: seriesRows,
    options: { stages, groups, teams },
    clusters: data.clusters,
  };
}

/** CSV：英雄榜 + 选手英雄池，两张表用一个文件，方便直接丢 Excel。 */
export function toCSV(agg) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rate = (value) => value == null ? "" : `${value}%`;
  const playerHero = (row) => row ? `${row.hero}（胜率${rate(row.winRate)}）` : "";
  const heroPlayer = (row) => row
    ? `${row.name}（使用${row.games}场，胜率${rate(row.winRate)}）`
    : "";
  const lines = [];
  lines.push("英雄榜");
  lines.push(["英雄", "出场", "胜场", "胜率%", "禁用", "pick率%", "ban率%", "presence%"].map(esc).join(","));
  for (const h of agg.heroes) {
    lines.push([h.hero, h.picks, h.wins, h.winRate ?? "", h.bans, h.pickRate ?? "", h.banRate ?? "", h.presenceRate ?? ""].map(esc).join(","));
  }
  lines.push("");
  lines.push("选手英雄池");
  lines.push(["选手", "队伍", "胜率最高英雄1", "胜率最高英雄2", "胜率最高英雄3"].map(esc).join(","));
  for (const p of agg.players) {
    const top = p.topHeroes || [];
    lines.push([p.name, p.team, playerHero(top[0]), playerHero(top[1]), playerHero(top[2])].map(esc).join(","));
  }
  lines.push("");
  lines.push("英雄排行榜");
  lines.push(["英雄", "获胜场次最多选手1", "获胜场次最多选手2", "获胜场次最多选手3"].map(esc).join(","));
  for (const hero of agg.heroes) {
    const top = hero.topPlayers || [];
    lines.push([hero.hero, heroPlayer(top[0]), heroPlayer(top[1]), heroPlayer(top[2])].map(esc).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}
