import crypto from "node:crypto";
import { listBracketMatches } from "./season-insights.mjs";

const LANES = ["上单", "打野", "中路", "发育路", "游走"];
const cleanText = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\u200b-\u200f\ufeff]/g, "")
  .replace(/\s+/g, " ")
  .trim();
const keyText = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\u200b-\u200f\ufeff]/g, "")
  .replace(/\s+/g, "")
  .trim()
  .toLocaleLowerCase();
const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== "";

function playerIndex(team, value) {
  const key = keyText(value);
  if (!key || !Array.isArray(team?.players)) return -1;
  return team.players.findIndex((name) => keyText(typeof name === "object" ? name.name : name) === key);
}

function canonicalPlayer(team, value, fallbackIndex) {
  const index = playerIndex(team, value);
  if (index >= 0) return {
    name: String(typeof team.players[index] === "object" ? team.players[index].name : team.players[index]),
    lane: String(team.playerLanes?.[index] || LANES[index] || ""),
    matched: true,
  };
  return { name: cleanText(value), lane: LANES[fallbackIndex] || "", matched: false };
}

function num(value, { integer = false, min = null, max = null } = {}) {
  if (!hasText(value)) return "";
  const parsed = Number(String(value).replace(/[%％,，\s]/g, "").replace(/k$/i, "e3"));
  if (!Number.isFinite(parsed) || integer && !Number.isInteger(parsed)) return "";
  if (min !== null && parsed < min) return "";
  if (max !== null && parsed > max) return "";
  return integer ? String(parsed) : String(parsed);
}

function emptyPlayer() {
  return {
    name: "", hero: "", k: "", d: "", a: "", cs: "", gpm: "", gold: "",
    goldShare: "", dmgPct: "", tankPct: "", kp: "", dmgPerGold: "", dmgWan: "",
  };
}

function normalizeSide(source, team, index, warnings) {
  if (!source) return emptyPlayer();
  const player = canonicalPlayer(team, source.name, index);
  if (source.name && !player.matched) warnings.push("第" + (index + 1) + "行选手「" + source.name + "」不在队伍名单中");
  const dmgRaw = hasText(source.dmgRaw) ? Number(source.dmgRaw) : null;
  const dmgFromRaw = Number.isFinite(dmgRaw) && dmgRaw >= 0
    ? String(Math.round(dmgRaw / 100) / 100)
    : "";
  return {
    name: player.name,
    hero: cleanText(source.hero),
    k: num(source.k, { integer:true, min:0 }),
    d: num(source.d, { integer:true, min:0 }),
    a: num(source.a, { integer:true, min:0 }),
    cs: "",
    gpm: "",
    gold: num(source.gold, { min:0 }),
    goldShare: num(source.goldShare, { min:0, max:100 }),
    dmgPct: num(source.dmgPct, { min:0, max:100 }),
    tankPct: num(source.tankPct, { min:0, max:100 }),
    kp: num(source.kp, { min:0, max:100 }),
    dmgPerGold: "",
    dmgWan: hasText(source.dmgWan) ? num(source.dmgWan, { min:0 }) : dmgFromRaw,
  };
}

function existingRows(game) {
  return LANES.map((lane, index) => {
    const source = Array.isArray(game?.rows) ? game.rows[index] || {} : {};
    return {
      pos: LANES.includes(source.pos) ? source.pos : lane,
      posOpp: LANES.includes(source.posOpp) ? source.posOpp : LANES[index],
      our: { ...emptyPlayer(), ...(source.our || {}) },
      opp: { ...emptyPlayer(), ...(source.opp || {}) },
    };
  });
}

function mergePlayer(existing, suggestion) {
  const output = { ...emptyPlayer(), ...(existing || {}) };
  for (const [field, value] of Object.entries(suggestion || {})) {
    if (hasText(value)) output[field] = value;
  }
  output.gpm = "";
  output.dmgPerGold = "";
  return output;
}

export function mergeRemoteDraft({ ocr = {}, existingGame = null, blueTeam = {}, redTeam = {} } = {}) {
  const warnings = [];
  const rows = existingRows(existingGame);
  const blue = Array.isArray(ocr.blue) ? ocr.blue : [];
  const red = Array.isArray(ocr.red) ? ocr.red : [];
  if (blue.length && blue.length !== 5) warnings.push("蓝方识别到 " + blue.length + " 行，应为 5 行");
  if (red.length && red.length !== 5) warnings.push("红方识别到 " + red.length + " 行，应为 5 行");
  for (let index = 0; index < 5; index++) {
    const bluePlayer = normalizeSide(blue[index], blueTeam, index, warnings);
    const redPlayer = normalizeSide(red[index], redTeam, index, warnings);
    const blueLane = canonicalPlayer(blueTeam, bluePlayer.name, index).lane;
    const redLane = canonicalPlayer(redTeam, redPlayer.name, index).lane;
    rows[index] = {
      ...rows[index],
      pos: LANES.includes(blueLane) ? blueLane : rows[index].pos || LANES[index],
      posOpp: LANES.includes(redLane) ? redLane : rows[index].posOpp || LANES[index],
      our: mergePlayer(rows[index].our, bluePlayer),
      opp: mergePlayer(rows[index].opp, redPlayer),
    };
  }
  const blueKills = rows.reduce((sum, row) => sum + (Number(row.our.k) || 0), 0);
  const redKills = rows.reduce((sum, row) => sum + (Number(row.opp.k) || 0), 0);
  const blueScore = hasText(ocr.blueScore) ? num(ocr.blueScore, { integer:true, min:0 }) : String(blueKills);
  const redScore = hasText(ocr.redScore) ? num(ocr.redScore, { integer:true, min:0 }) : String(redKills);
  const duration = hasText(ocr.duration) ? cleanText(ocr.duration) : String(existingGame?.duration || "");
  const result = Number(blueScore) > Number(redScore) ? "win"
    : Number(redScore) > Number(blueScore) ? "lose"
      : existingGame?.result || "win";
  const draft = {
    blueTeam: String(blueTeam.name || ""),
    redTeam: String(redTeam.name || ""),
    blueScore,
    redScore,
    duration,
    result,
    rows,
    warnings,
  };
  const validation = validateRemoteDraft(draft);
  draft.warnings = Array.from(new Set([...warnings, ...validation.warnings]));
  draft.missing = validation.missing;
  return draft;
}

export function validateRemoteDraft(draft = {}) {
  const missing = [];
  const warnings = [];
  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  if (rows.length !== 5) missing.push("双方对位应为 5 行，当前 " + rows.length + " 行");
  for (const [side, label] of [["our", "蓝方"], ["opp", "红方"]]) {
    const heroes = [];
    LANES.forEach((lane, index) => {
      const player = rows[index]?.[side] || {};
      const absent = [];
      if (!hasText(player.name)) absent.push("选手");
      if (!hasText(player.hero)) absent.push("英雄");
      if (absent.length) missing.push(label + "第" + (index + 1) + "行缺 " + absent.join("/"));
      if (hasText(player.hero)) {
        const hero = cleanText(player.hero);
        if (heroes.includes(hero)) warnings.push(label + "英雄重复：" + hero);
        heroes.push(hero);
      }
      for (const [field, labelText, max] of [
        ["dmgPct", "输出占比", 100], ["tankPct", "承伤占比", 100],
        ["goldShare", "经济占比", 100], ["kp", "参团率", 100],
      ]) {
        if (hasText(player[field]) && num(player[field], { min:0, max }) === "") {
          warnings.push(label + "第" + (index + 1) + "行" + labelText + "超出 0—100");
        }
      }
      for (const [field, labelText] of [["k", "击杀"], ["d", "死亡"], ["a", "助攻"]]) {
        if (hasText(player[field]) && num(player[field], { integer:true, min:0 }) === "") {
          warnings.push(label + "第" + (index + 1) + "行" + labelText + "不是非负整数");
        }
      }
    });
  }
  if (!/^\d{1,2}:\d{1,2}$/.test(String(draft.duration || "").trim())
    || Number(String(draft.duration).split(":")[1]) > 59) {
    warnings.push("对局时长应使用 mm:ss，当前为 " + (draft.duration || "空"));
  }
  const blueKills = rows.reduce((sum, row) => sum + (Number(row?.our?.k) || 0), 0);
  const redKills = rows.reduce((sum, row) => sum + (Number(row?.opp?.k) || 0), 0);
  if (hasText(draft.blueScore) && Number(draft.blueScore) !== blueKills) warnings.push("蓝方比分与选手击杀合计不一致");
  if (hasText(draft.redScore) && Number(draft.redScore) !== redKills) warnings.push("红方比分与选手击杀合计不一致");
  return { missing, warnings };
}

export function buildRemoteMatchContext({
  library = null,
  matches = null,
  bracket = null,
  context = null,
  matchesRevision = "",
  contextRevision = 0,
} = {}) {
  const seriesId = String(context?.seriesId || library?.currentId || "");
  const series = (library?.series || []).find((item) => String(item.id) === seriesId) || (library?.series || [])[0] || null;
  if (!series) throw Object.assign(new Error("找不到当前系列赛"), { code:"series_not_found" });
  const bracketMatches = listBracketMatches(bracket?.[series.id] || {}, series.teams || []);
  const allGames = matches?.games?.[series.id] || [];
  const result = bracketMatches.map((match) => {
    const games = allGames.filter((game) => String(game.matchKey || "") === match.matchKey).map((game) => ({
      id: String(game.id || ""),
      label: String(game.label || ""),
      score: [String(game.ourScore ?? ""), String(game.oppScore ?? "")],
      result: String(game.result || ""),
      duration: String(game.duration || ""),
    })).sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric:true }));
    return {
      ...match,
      label: match.blueName + " vs " + match.redName,
      gameKey: match.matchKey,
      games,
      nextGameLabel: "第" + (games.length + 1) + "局",
    };
  });
  const preferred = result.find((match) => match.matchKey === context?.matchKey) || result[0] || null;
  return {
    seriesId: String(series.id),
    seriesName: String(series.name || ""),
    currentMatchKey: context?.matchKey || "",
    currentGameId: context?.gameId || "",
    selectedMatchKey: preferred?.matchKey || "",
    matchesRevision,
    contextRevision,
    matches: result,
  };
}

export function buildRemoteGame({
  seriesId = "",
  matchKey = "",
  blueTeam = {},
  redTeam = {},
  draft = {},
  existingGames = [],
  existingGame = null,
  gameId = "",
  allowedMatchKeys = null,
} = {}) {
  if (Array.isArray(allowedMatchKeys) && !allowedMatchKeys.includes(String(matchKey))) {
    throw Object.assign(new Error("找不到目标场次或双方队伍尚未排定"), { code:"match_not_found" });
  }
  if (!blueTeam.id || !redTeam.id || blueTeam.id === redTeam.id) {
    throw Object.assign(new Error("目标场次双方队伍无效"), { code:"invalid_match_teams" });
  }
  if (!Array.isArray(draft.rows) || draft.rows.length !== 5) {
    throw Object.assign(new Error("对局数据必须包含双方 5 行对位"), { code:"invalid_draft" });
  }
  const validation = validateRemoteDraft(draft);
  const sameMatchGames = existingGames.filter((game) => String(game.matchKey || "") === String(matchKey));
  const game = existingGame || {
    id: String(gameId || crypto.randomUUID()),
    label: "第" + (sameMatchGames.length + 1) + "局",
    matchKey:String(matchKey),
    ourId:String(blueTeam.id),
    oppId:String(redTeam.id),
    ourScore:"",
    oppScore:"",
    result:"win",
    date:"",
    duration:"",
    dmgBlue:"",
    dmgRed:"",
    rows:[],
  };
  const rows = LANES.map((lane, index) => {
    const source = draft.rows[index] || {};
    const our = { ...emptyPlayer(), ...(source.our || {}), gpm:"", dmgPerGold:"" };
    const opp = { ...emptyPlayer(), ...(source.opp || {}), gpm:"", dmgPerGold:"" };
    for (const field of ["k","d","a"]) {
      our[field] = num(our[field], { integer:true, min:0 });
      opp[field] = num(opp[field], { integer:true, min:0 });
    }
    for (const field of ["gold","dmgWan"]) {
      our[field] = num(our[field], { min:0 });
      opp[field] = num(opp[field], { min:0 });
    }
    for (const field of ["dmgPct","tankPct","goldShare","kp"]) {
      our[field] = num(our[field], { min:0, max:100 });
      opp[field] = num(opp[field], { min:0, max:100 });
    }
    return {
      pos: LANES.includes(source.pos) ? source.pos : lane,
      posOpp: LANES.includes(source.posOpp) ? source.posOpp : lane,
      our,
      opp,
    };
  });
  const next = {
    ...game,
    id: String(game.id || gameId || crypto.randomUUID()),
    matchKey:String(matchKey),
    ourId:String(blueTeam.id),
    oppId:String(redTeam.id),
    ourScore: num(draft.blueScore, { integer:true, min:0 }),
    oppScore: num(draft.redScore, { integer:true, min:0 }),
    result: draft.result === "lose" ? "lose" : "win",
    duration: cleanText(draft.duration),
    rows,
  };
  return {
    game: next,
    replaced: !!existingGame,
    missing: validation.missing,
    warnings: validation.warnings,
  };
}
