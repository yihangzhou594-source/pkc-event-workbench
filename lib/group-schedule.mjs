/**
 * 根据队伍库里每支队伍的完整小组归属，生成 A/B/C/D 单循环赛程。
 * 淘汰赛页的 groups 只代表晋级/抽签队伍，不能作为完整小组名单。
 */

const GROUP_KEYS = ["A", "B", "C", "D"];
const GROUP_ALIASES = {
  A: "A", A组: "A", 一: "A", 一组: "A", "1": "A", "1组": "A",
  B: "B", B组: "B", 二: "B", 二组: "B", "2": "B", "2组": "B",
  C: "C", C组: "C", 三: "C", 三组: "C", "3": "C", "3组": "C",
  D: "D", D组: "D", 四: "D", 四组: "D", "4": "D", "4组": "D",
};

function groupKey(value) {
  return GROUP_ALIASES[String(value || "").replace(/\s+/g, "").toUpperCase()] || "";
}

function roundRobin(teamIds) {
  const list = teamIds.slice();
  if (list.length < 2) return [];
  if (list.length % 2) list.push("");
  const rounds = [];
  const n = list.length;
  let ring = list.slice();

  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const left = ring[i];
      const right = ring[n - 1 - i];
      if (!left || !right) continue;
      games.push(r % 2 && i === 0 ? [right, left] : [left, right]);
    }
    rounds.push(games);
    ring = [ring[0], ring[n - 1], ...ring.slice(1, -1)];
  }
  return rounds;
}

export function buildGroupSchedule({ library = null, seriesId = "" } = {}) {
  const series = (library && Array.isArray(library.series) ? library.series : [])
    .find((item) => String(item && item.id || "") === String(seriesId || ""));
  if (!series) {
    return { seriesId: String(seriesId || ""), groups: [], matches: [] };
  }

  const buckets = Object.fromEntries(GROUP_KEYS.map((key) => [key, []]));
  for (const team of Array.isArray(series.teams) ? series.teams : []) {
    if (!team || !team.id) continue;
    const key = groupKey(team.group);
    if (key) buckets[key].push(team);
  }
  const groups = [];
  const matches = [];

  for (const key of GROUP_KEYS) {
    const teams = buckets[key].map((source) => {
      return {
        id: String(source.id),
        name: String(source.name || "").trim() || "（未命名）",
        eliminated: !!(source.eliminated || source.availableForSelection === false),
      };
    });
    const ids = teams.map((team) => team.id);
    const displayName = (team) => team.name + (team.eliminated ? "（已淘汰）" : "");
    const rounds = roundRobin(ids).map((round, roundIndex) => {
      return round.map(([leftId, rightId], gameIndex) => {
        const left = teams.find((team) => team.id === leftId);
        const right = teams.find((team) => team.id === rightId);
        const pair = [leftId, rightId].sort().join("-");
        return {
          id: `${series.id}:${key}:r${roundIndex + 1}:${pair}`,
          group: `${key}组`,
          round: `第${roundIndex + 1}轮`,
          gameNo: gameIndex + 1,
          left,
          right,
          label: `${key}组 · 第${roundIndex + 1}轮 · ${displayName(left)} vs ${displayName(right)}`,
        };
      });
    });
    const groupMatches = rounds.flat();
    if (groupMatches.length) {
      groups.push({ key, name: `${key}组`, teams, rounds: rounds.length });
      matches.push(...groupMatches);
    }
  }
  return { seriesId: String(series.id), groups, matches };
}
