/*
 * OCR 数值解析、候选投票与语义校验。
 *
 * 这个文件刻意不依赖 DOM，既能在浏览器里作为普通脚本加载，也能在 Node 的
 * 回归测试里直接 require。识别器只负责给出候选，最终取值由这里结合重复证据、
 * 跨页重复字段和队伍级约束决定。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PKCOCR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clean = v => String(v == null ? "" : v).replace(/\s+/g, "");
  const int = v => {
    const n = Number.parseInt(String(v == null ? "" : v).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  function parseKda(text) {
    const s = clean(text);
    if (!s) return null;
    let parts = s.split(/[^\d]+/).filter(Boolean);
    if (parts.length === 3) {
      let nums = parts.map(Number);
      /* 「1/73/70」常见于斜杠被读成 7：保留奇数位的数字即可还原 1/3/0。 */
      if (nums.some((n, i) => i > 0 && String(n).length > 1 && n > 30)) {
        const digits = s.match(/\d/g) || [];
        if (digits.length === 5) nums = [+digits[0], +digits[2], +digits[4]];
      }
      if (nums.every(n => Number.isInteger(n) && n >= 0 && n <= 99)) return nums;
    }
    const digits = s.match(/\d/g) || [];
    if (digits.length === 3) return digits.map(Number);
    if (digits.length === 5) return [+digits[0], +digits[2], +digits[4]];
    return null;
  }

  function parseKilo(text) {
    const s = clean(text);
    const m = s.match(/(\d+(?:\.\d+)?)\s*[kK]/);
    if (!m) return null;
    let n = Math.round(parseFloat(m[1]) * 1000);
    /* 315k 多半是 31.5k 的小数点被吞掉；同一套规则也保护了承伤/输出列。 */
    if (n > 200000 && !m[1].includes(".")) n = Math.round(n / 10);
    return Number.isFinite(n) ? n : null;
  }

  function parsePct(text) {
    const s = clean(text);
    if (!s.includes("%")) return null;
    const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }

  function parseGold(text) {
    const s = clean(text).replace(/[,，]/g, "");
    if (!/^\d{3,6}$/.test(s)) return null;
    return int(s);
  }

  function candidateValue(item, kind) {
    if (item && item.value !== undefined && item.value !== null) {
      if (kind === "kda") return Array.isArray(item.value) ? item.value : parseKda(item.value);
      return item.value;
    }
    const t = item && item.text;
    if (kind === "kda") return parseKda(t);
    if (kind === "kilo") return parseKilo(t);
    if (kind === "pct") return parsePct(t);
    if (kind === "gold") return parseGold(t);
    return clean(t) || null;
  }

  function candidateKey(value, kind) {
    if (kind === "kda") return Array.isArray(value) ? value.join("/") : "";
    return String(value);
  }

  /**
   * 同一格子的候选值按“重复出现”优先，而不是只按单次 OCR 置信度。
   * 一个 88 分的错误值经常输给两个 60 分的正确值，这是多版本识别的核心。
   */
  function voteCandidates(items, kind) {
    const groups = new Map();
    (items || []).forEach((item, i) => {
      const value = candidateValue(item, kind);
      if (value === null || value === undefined) return;
      const key = candidateKey(value, kind);
      if (!key) return;
      const g = groups.get(key) || { value, count: 0, confSum: 0, maxConf: 0, variants: new Set() };
      g.count += 1;
      g.confSum += Number.isFinite(+item.conf) ? +item.conf : 0;
      g.maxConf = Math.max(g.maxConf, Number.isFinite(+item.conf) ? +item.conf : 0);
      if (item.variant) g.variants.add(item.variant);
      groups.set(key, g);
    });
    let best = null;
    for (const g of groups.values()) {
      const score = g.count * 100 + g.maxConf + g.confSum / Math.max(1, g.count);
      const candidate = {
        value: g.value,
        support: g.count,
        conf: Math.round(g.confSum / Math.max(1, g.count)),
        variants: [...g.variants],
        score,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }

  const num = v => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sum = (list, key) => list.reduce((t, x) => t + (num(x && x[key]) || 0), 0);
  const present = (list, key) => list.some(x => x && x[key] !== null && x[key] !== undefined && x[key] !== "");
  const round1 = n => Math.round(n * 10) / 10;

  function addIssue(issues, issue) {
    if (!issues.some(x => x.code === issue.code && x.side === issue.side && x.row === issue.row)) {
      issues.push(issue);
    }
  }

  function mergeClientPages(pages, opts) {
    const options = opts || {};
    const gear = (pages || []).find(p => p && p.type === "gear") || null;
    const stats = (pages || []).find(p => p && p.type === "stats") || null;
    const issues = [];
    const rows = { our: [], opp: [] };
    const conf = { our: [], opp: [] };
    const scores = { our: "", opp: "" };
    const kills = { our: 0, opp: 0 };
    const corrections = [];

    ["our", "opp"].forEach(side => {
      for (let i = 0; i < 5; i++) {
        const g = gear && gear.rows && gear.rows[side] ? (gear.rows[side][i] || {}) : {};
        const st = stats && stats.rows && stats.rows[side] ? (stats.rows[side][i] || {}) : {};
        const merged = {
          name: g.name || st.name || "",
          k: g.k !== undefined ? g.k : st.k,
          d: g.d !== undefined ? g.d : st.d,
          a: g.a !== undefined ? g.a : st.a,
          gold: g.gold !== undefined ? String(g.gold) : "",
          goldRaw: st.goldRaw !== undefined ? st.goldRaw : null,
          dmgRaw: st.dmgRaw !== undefined ? st.dmgRaw : null,
          tankRaw: st.tankRaw !== undefined ? st.tankRaw : null,
          dmgPct: st.dmgPct !== undefined ? st.dmgPct : null,
          tankPct: st.tankPct !== undefined ? st.tankPct : null,
          goldShare: st.goldShare !== undefined ? st.goldShare : null,
          kp: st.kp !== undefined ? st.kp : null,
        };

        /* 装备页和数据页都会给出金币；冲突时听置信度更高的一侧。 */
        const gg = parseGold(merged.gold);
        const sg = parseGold(merged.goldRaw);
        if (gg !== null && sg !== null && Math.abs(gg - sg) > 60) {
          const gConf = Number(gear && gear.conf && gear.conf[side] && gear.conf[side][i] && gear.conf[side][i].gold) || 0;
          const sConf = Number(stats && stats.conf && stats.conf[side] && stats.conf[side][i] && (stats.conf[side][i].goldRaw || stats.conf[side][i].gold)) || 0;
          /* 两张图的数值差出一个数量级，通常是数据页把伤害/承伤误塞进经济列；
             装备页的纯数字经济更可信，不让它被这种结构性错值覆盖。 */
          if (sg > gg * 3 || sg < gg / 3) merged.gold = String(gg);
          else merged.gold = String(sConf > gConf ? sg : gg);
          addIssue(issues, {
            code: "gold-conflict", side, row: i, field: "gold",
            message: "两张截图的" + (side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) +
              " 行总经济不一致（" + gg + " / " + sg + "），已取置信度较高的一侧。",
          });
        } else if (gg === null && sg !== null) {
          merged.gold = String(sg);
        }
        if (merged.goldRaw !== null && merged.gold === "") merged.gold = String(merged.goldRaw);
        rows[side].push(merged);
        conf[side].push({
          ...(gear && gear.conf && gear.conf[side] ? gear.conf[side][i] : {}),
          ...(stats && stats.conf && stats.conf[side] ? stats.conf[side][i] : {}),
        });
      }
      const nums = rows[side].map(r => num(r.k)).filter(v => v !== null);
      kills[side] = nums.reduce((t, n) => t + n, 0);
    });

    ["our", "opp"].forEach(side => {
      const given = options.scores && options.scores[side];
      const inferred = String(kills[side]);
      scores[side] = given === null || given === undefined || given === "" ? inferred : String(given);
      if (given !== null && given !== undefined && given !== "" && String(given) !== inferred) {
        addIssue(issues, {
          code: "score-kda-mismatch", side, field: "score",
          message: (side === "our" ? "蓝方" : "红方") + "比分是 " + given + "，但五名选手击杀合计为 " + inferred +
            "；请核对 KDA 或比分。",
        });
      }
    });

    /* 击杀/死亡在两边应当互相抵消：一方总死亡数 = 另一方总击杀数。 */
    ["our", "opp"].forEach(side => {
      const other = side === "our" ? "opp" : "our";
      const deaths = rows[side].map(r => num(r.d)).filter(v => v !== null).reduce((t, n) => t + n, 0);
      if (present(rows[side], "d") && present(rows[other], "k") && deaths !== kills[other]) {
        addIssue(issues, {
          code: "deaths-kills-mismatch", side, field: "deaths",
          message: (side === "our" ? "蓝方" : "红方") + "总死亡 " + deaths + " 与对方总击杀 " + kills[other] + " 不一致。",
        });
      }
    });

    ["our", "opp"].forEach(side => {
      const list = rows[side];
      const repairOutlier = (rawKey, pctKey, maxPlausible, label) => {
        const total = sum(list, rawKey);
        list.forEach((r, i) => {
          const raw = num(r[rawKey]), pct = num(r[pctKey]);
          if (raw === null || raw <= maxPlausible) return;
          let expected = null;
          if (pct !== null && pct > 0 && pct < 100){
            const rest = total - raw;
            if (rest > 0) expected = Math.round(pct * rest / (100 - pct));
          }
          if (expected === null){
            /* 百分比也被漏掉时，用其余四人的中位数兜底，至少不让一个大十倍的值
               把全队占比全部带偏。 */
            const others = list
              .filter((_, j) => j !== i)
              .map(x => num(x[rawKey]))
              .filter(v => v !== null && v > 0)
              .sort((a,b) => a-b);
            if (others.length >= 3) expected = others[Math.floor(others.length/2)];
          }
          if (!(expected > 0)) return;
          r[rawKey] = expected;
          corrections.push({
            code:"raw-outlier", side, row:i, field:rawKey,
            message:(side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行" + label +
              "原值 " + raw + " 明显异常，已按占比 " + pct + "% 反算为 " + expected + "。",
          });
        });
      };
      repairOutlier("dmgRaw", "dmgPct", 250000, "输出伤害");
      repairOutlier("tankRaw", "tankPct", 250000, "承受伤害");
      repairOutlier("goldRaw", "goldShare", 200000, "总经济");
      const teamGold = sum(list, "gold");
      const teamDmg = sum(list, "dmgRaw");
      const teamTank = sum(list, "tankRaw");
      const teamKills = kills[side];
      /* 截图里百分比条偶尔会把某个 % 完全漏掉。只要同队的原始伤害/经济还在，
         就能用队伍总和把它补回来；已识别出的错值不在这里静默覆盖，交给冲突检查。 */
      list.forEach((r, i) => {
        const derive = (key, rawKey, total, label) => {
          if (r[key] !== null && r[key] !== undefined && r[key] !== "") return;
          const raw = num(r[rawKey]);
          if (raw === null || !(total > 0)) return;
          const value = round1(raw / total * 100);
          r[key] = value;
          corrections.push({
            code:"share-derived", side, row:i, field:key,
            message:(side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行" + label +
              "缺失，已按同队原始值推算为 " + value + "%。",
          });
        };
        derive("dmgPct", "dmgRaw", teamDmg, "输出占比");
        derive("tankPct", "tankRaw", teamTank, "承伤占比");
        derive("goldShare", "gold", teamGold, "经济占比");
        if (r.kp === null || r.kp === undefined || r.kp === "") {
          const k = num(r.k), a = num(r.a);
          if (teamKills > 0 && k !== null && a !== null) {
            r.kp = round1(Math.min(100, (k + a) / teamKills * 100));
            corrections.push({
              code:"kp-derived", side, row:i, field:"kp",
              message:(side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) +
                " 行参团率缺失，已按 (击杀+助攻)/队伍击杀 推算为 " + r.kp + "%。",
            });
          }
        }
      });
      [["dmgPct", "输出伤害占比"], ["tankPct", "承伤占比"], ["goldShare", "经济占比"]].forEach(([key, label]) => {
        if (!present(list, key)) return;
        const total = sum(list, key);
        if (Math.abs(total - 100) > 2.5) {
          addIssue(issues, {
            code: "share-sum", side, field: key,
            message: (side === "our" ? "蓝方" : "红方") + label + "合计 " + round1(total) + "%，不是 100%；可能有错值。",
          });
        }
      });

      list.forEach((r, i) => {
        if (r.goldShare !== null && r.goldShare !== undefined && teamGold > 0 && r.gold) {
          const expected = num(r.gold) / teamGold * 100;
          if (Math.abs(expected - num(r.goldShare)) > 4) {
            addIssue(issues, {
              code: "gold-share-ratio", side, row: i, field: "goldShare",
              message: (side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行经济占比 " + r.goldShare +
                "% 与个人/队伍经济推算的 " + round1(expected) + "% 不一致。",
            });
          }
        }
        if (r.dmgPct !== null && r.dmgPct !== undefined && teamDmg > 0 && r.dmgRaw !== null) {
          const expected = num(r.dmgRaw) / teamDmg * 100;
          if (Math.abs(expected - num(r.dmgPct)) > 4) {
            addIssue(issues, {
              code: "damage-share-ratio", side, row: i, field: "dmgPct",
              message: (side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行输出占比 " + r.dmgPct +
                "% 与输出伤害推算的 " + round1(expected) + "% 不一致。",
            });
          }
        }
        if (r.kp !== null && r.kp !== undefined && teamKills > 0 && num(r.k) !== null && num(r.a) !== null) {
          const expected = Math.min(100, (num(r.k) + num(r.a)) / teamKills * 100);
          if (Math.abs(expected - num(r.kp)) > 20) {
            addIssue(issues, {
              code: "kp-ratio", side, row: i, field: "kp",
              message: (side === "our" ? "蓝方" : "红方") + "第 " + (i + 1) + " 行参团率 " + r.kp +
                "% 与 (击杀+助攻)/队伍击杀 推算的 " + round1(expected) + "% 差距较大。",
            });
          }
        }
      });
    });

    return { gear, stats, rows, conf, issues, corrections, scores, kills,
      inferredScores:{ our:String(kills.our), opp:String(kills.opp) } };
  }

  return {
    clean, parseKda, parseKilo, parsePct, parseGold,
    voteCandidates, mergeClientPages,
  };
});
