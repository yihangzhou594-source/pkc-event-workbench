(() => {
  "use strict";

  const W = 1920;
  const H = 1080;
  const GOLD = "#d8b35b";
  const BLUE = "#75c8ff";
  const RED = "#ff7d8f";
  const WHITE = "#f4f7fb";
  const MUTED = "rgba(244,247,251,.58)";
  const PAGES = [
    ["overview", "seasonOverview"],
    ["teams", "seasonTeams"],
    ["compare", "seasonCompare"],
    ["players", "seasonPlayers"],
    ["heroes", "seasonHeroes"],
    ["poster", "seasonPoster"],
  ];
  let library = null;
  let insights = null;
  let requestVersion = 0;
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const num = (value, digits = 1) => value === null || value === undefined ? "N/A"
    : Number(value).toLocaleString("zh-CN", { maximumFractionDigits:digits });
  const pctText = (value) => value === null || value === undefined ? "N/A" : num(value, 1) + "%";
  const initials = (name) => String(name || "?").replace(/\s+/g, "").slice(0, 2) || "?";
  const timeText = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12:false }) : "—";

  function canvasSetup(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }
  function rr(ctx, x, y, w, h, radius = 16) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function setFont(ctx, size, weight = 400, color = WHITE, family = '"Microsoft YaHei",sans-serif') {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
  }
  function text(ctx, value, x, y, size = 24, weight = 400, color = WHITE, align = "left") {
    setFont(ctx, size, weight, color);
    ctx.textAlign = align;
    ctx.fillText(String(value ?? ""), x, y);
  }
  function fit(ctx, value, x, y, maxWidth, size = 28, weight = 700, color = WHITE, align = "left") {
    let current = size;
    setFont(ctx, current, weight, color);
    const raw = String(value ?? "");
    while (current > Math.max(12, size * .55) && ctx.measureText(raw).width > maxWidth) {
      current -= 1;
      setFont(ctx, current, weight, color);
    }
    let output = raw;
    while (output.length > 1 && ctx.measureText(output + "…").width > maxWidth) output = output.slice(0, -1);
    if (output !== raw) output += "…";
    ctx.textAlign = align;
    ctx.fillText(output, x, y);
  }
  function wrap(ctx, value, x, y, maxWidth, lineHeight, size = 20, weight = 400, color = MUTED) {
    setFont(ctx, size, weight, color);
    let line = "";
    let top = y;
    for (const char of String(value ?? "")) {
      const next = line + char;
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, x, top);
        top += lineHeight;
        line = char;
      } else line = next;
    }
    if (line) ctx.fillText(line, x, top);
    return top;
  }
  function pill(ctx, label, x, y, color = GOLD, size = 18) {
    setFont(ctx, size, 700, color);
    const width = ctx.measureText(String(label)).width + 28;
    rr(ctx, x, y - size, width, size * 2, size);
    ctx.fillStyle = color + "22";
    ctx.fill();
    ctx.strokeStyle = color + "88";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    setFont(ctx, size, 700, color);
    ctx.textAlign = "left";
    ctx.fillText(String(label), x + 14, y + 1);
    return width;
  }
  function base(ctx, title, subtitle) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a1b20");
    bg.addColorStop(.55, "#16171a");
    bg.addColorStop(1, "#0d0e11");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * .35, 40, W / 2, H * .35, W * .68);
    glow.addColorStop(0, "rgba(75,105,150,.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = .2;
    ctx.strokeStyle = "#9cb9d9";
    ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 96) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * .5, H); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(216,179,91,.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 96, W - 56, H - 132);
    pill(ctx, "PKC SEASON", 62, 62, GOLD, 15);
    fit(ctx, title, 260, 66, W - 520, 38, 800, WHITE);
    text(ctx, subtitle, W - 64, 66, 18, 500, MUTED, "right");
    ctx.fillStyle = "rgba(216,179,91,.42)";
    ctx.fillRect(62, 94, W - 124, 1.5);
  }
  function footer(ctx, quality) {
    const textLine = `有效 ${quality.validGames} 局 · 缺失 ${quality.missingGames} · 弃权 ${insights.meta.forfeitMatches} · 冲突 ${quality.conflictGames} · ${timeText(insights.meta.generatedAt)}`;
    fit(ctx, textLine, W / 2, H - 25, W - 220, 15, 500, "rgba(255,255,255,.45)", "center");
  }
  function panel(ctx, x, y, width, height, title = "") {
    rr(ctx, x, y, width, height, 18);
    ctx.fillStyle = "rgba(255,255,255,.045)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.13)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (title) text(ctx, title, x + 22, y + 28, 18, 800, GOLD);
  }
  function empty(ctx, label) {
    text(ctx, "暂无可用数据", W / 2, H / 2 - 10, 42, 800, "rgba(255,255,255,.32)", "center");
    text(ctx, label, W / 2, H / 2 + 40, 20, 500, MUTED, "center");
  }
  function teamById(id) {
    return (insights?.teams || []).find((team) => String(team.id) === String(id)) || null;
  }
  function teamHeroes(name) {
    return (insights?.heroes || []).filter((hero) =>
      (hero.teams || []).some((team) => team === name)
    ).sort((a, b) => (b.teamPicks?.find((item) => item.team === name)?.picks || 0)
      - (a.teamPicks?.find((item) => item.team === name)?.picks || 0)).slice(0, 6);
  }

  function drawOverview(ctx) {
    base(ctx, insights.meta.seriesName || "赛季总览", "官方赛果与有效对局统一口径");
    const q = insights.dataQuality;
    const cards = [
      ["已确认赛果", insights.meta.officialMatches, "场系列赛"],
      ["有效对局", q.validGames, "进入英雄统计"],
      ["参赛队伍", insights.teams.length, "当前系列赛"],
      ["淘汰赛进度", `${insights.meta.stageProgress.completed}/${insights.meta.stageProgress.total}`, "已产生结果"],
    ];
    cards.forEach((item, index) => {
      const x = 72 + (index % 2) * 470;
      const y = 150 + Math.floor(index / 2) * 150;
      panel(ctx, x, y, 430, 124);
      text(ctx, item[0], x + 24, y + 34, 18, 700, MUTED);
      text(ctx, item[1], x + 24, y + 78, 48, 800, WHITE, "left");
      text(ctx, item[2], x + 24, y + 105, 15, 500, "rgba(255,255,255,.38)");
    });
    panel(ctx, 1010, 150, 838, 428, "当前赛季进度");
    const champion = insights.meta.champion;
    pill(ctx, champion ? "赛季冠军已产生" : "赛季进行中", 1040, 215, champion ? GOLD : BLUE, 17);
    text(ctx, champion || "冠军尚未产生", 1040, 285, 44, 800, champion ? GOLD : WHITE);
    text(ctx, champion ? "官方赛程已产生最终冠军" : `剩余 ${insights.meta.remainingTeams} 支队伍 · 以赛程赛果为准`, 1040, 330, 20, 500, MUTED);
    const maxTeams = insights.teams.slice(0, 4);
    maxTeams.forEach((team, index) => {
      const x = 1040 + index * 190;
      panel(ctx, x, 380, 168, 140);
      text(ctx, "排名 " + team.rank, x + 16, 406, 14, 700, GOLD);
      fit(ctx, team.name, x + 16, 448, 134, 24, 800);
      text(ctx, `${team.wins}胜 ${team.losses}负`, x + 16, 487, 18, 700, WHITE);
    });
    panel(ctx, 72, 470, 898, 430, "数据完整度与口径");
    const rows = [
      ["有效局", q.validGames, "双方 5 人、10 英雄不重复、胜方明确"],
      ["暂无数据", q.noDataGames, "不计入选手、英雄和 BP 分母"],
      ["冲突局", q.conflictGames, "需回到原始数据核对"],
      ["弃权/判负", insights.meta.forfeitMatches, "计入官方胜负，不计英雄数据"],
      ["缺失局", q.missingGames, "字段不全，未参与统计"],
    ];
    rows.forEach((row, index) => {
      const y = 555 + index * 62;
      text(ctx, row[0], 102, y, 20, 700, WHITE);
      text(ctx, String(row[1]), 300, y, 23, 800, index ? RED : GOLD, "center");
      text(ctx, row[2], 370, y, 16, 500, MUTED);
    });
    if (insights.warnings.length) {
      panel(ctx, 1010, 610, 838, 290, "需要关注");
      insights.warnings.slice(0, 4).forEach((warning, index) => {
        text(ctx, "• " + warning.message, 1042, 680 + index * 48, 19, 600, "rgba(255,218,139,.82)");
      });
    }
    footer(ctx, q);
  }

  function drawTeams(ctx) {
    base(ctx, "队伍状态", "小组战绩 · 最近五场 · 淘汰赛进度");
    const groups = insights.groups.length ? insights.groups : [{ key:"ALL", name:"全部队伍", teams:insights.teams }];
    const count = Math.min(4, groups.length);
    const gap = 20;
    const width = (W - 124 - gap * (count - 1)) / count;
    groups.slice(0, 4).forEach((group, index) => {
      const x = 62 + index * (width + gap);
      panel(ctx, x, 136, width, 814);
      text(ctx, group.name, x + 22, 172, 25, 800, GOLD);
      text(ctx, `${group.teams.length} 支队伍`, x + width - 22, 172, 16, 500, MUTED, "right");
      const rows = group.teams.slice(0, 7);
      rows.forEach((team, rowIndex) => {
        const y = 224 + rowIndex * 96;
        rr(ctx, x + 15, y, width - 30, 80, 12);
        ctx.fillStyle = rowIndex % 2 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.06)";
        ctx.fill();
        text(ctx, String(team.rank), x + 34, y + 27, 15, 800, GOLD);
        fit(ctx, team.name, x + 64, y + 27, width - 86, 23, 800, WHITE);
        text(ctx, `${team.wins}W ${team.losses}L · 局差 ${team.gameDiff >= 0 ? "+" : ""}${team.gameDiff}`, x + 34, y + 57, 15, 600, MUTED);
        const form = team.recentForm || [];
        form.forEach((result, formIndex) => {
          const cx = x + width - 32 - (form.length - formIndex - 1) * 25;
          ctx.beginPath();
          ctx.arc(cx, y + 57, 9, 0, Math.PI * 2);
          ctx.fillStyle = result === "W" ? "rgba(34,186,113,.82)" : "rgba(210,67,89,.82)";
          ctx.fill();
          text(ctx, result, cx, y + 58, 11, 800, WHITE, "center");
        });
      });
      if (!rows.length) {
        text(ctx, "暂无战绩", x + width / 2, 460, 22, 600, MUTED, "center");
      }
    });
    footer(ctx, insights.dataQuality);
  }

  function drawCompare(ctx) {
    base(ctx, "双方对比", "当前赛季直接交手与队伍结构");
    const head = insights.headToHead;
    const left = teamById(head.leftId);
    const right = teamById(head.rightId);
    if (!left || !right) {
      empty(ctx, "请选择两支可用的队伍");
      footer(ctx, insights.dataQuality);
      return;
    }
    panel(ctx, 62, 136, 760, 250);
    panel(ctx, W - 822, 136, 760, 250);
    text(ctx, left.name, 100, 205, 34, 800, BLUE);
    text(ctx, right.name, W - 138, 205, 34, 800, RED, "right");
    const metrics = [
      ["系列赛战绩", `${left.wins}-${left.losses}`, `${right.wins}-${right.losses}`],
      ["胜率", pctText(left.winRate), pctText(right.winRate)],
      ["局差", left.gameDiff >= 0 ? "+" + left.gameDiff : String(left.gameDiff), right.gameDiff >= 0 ? "+" + right.gameDiff : String(right.gameDiff)],
    ];
    metrics.forEach((row, index) => {
      const y = 268 + index * 40;
      text(ctx, row[1], 100, y, 24, 800, BLUE);
      text(ctx, row[0], 960, y, 17, 600, MUTED, "center");
      text(ctx, row[2], W - 138, y, 24, 800, RED, "right");
    });
    pill(ctx, left.wins + " : " + right.wins, 960 - 52, 205, GOLD, 22);

    panel(ctx, 62, 420, 830, 505, "直接交手");
    const meetings = head.meetings.slice(0, 6);
    if (!meetings.length) {
      text(ctx, "本赛季暂无交手", 477, 620, 30, 700, MUTED, "center");
      text(ctx, "这里不会用其他队伍数据代替", 477, 662, 18, 500, "rgba(255,255,255,.35)", "center");
    } else {
      meetings.forEach((meeting, index) => {
        const y = 500 + index * 64;
        text(ctx, meeting.round || meeting.source, 92, y, 17, 700, MUTED);
        fit(ctx, meeting.left, 285, y, 190, 18, 700, BLUE, "right");
        text(ctx, `${meeting.leftScore ?? "N/A"} : ${meeting.rightScore ?? "N/A"}`, 500, y, 22, 800, WHITE, "center");
        fit(ctx, meeting.right, 545, y, 190, 18, 700, RED);
        if (meeting.forfeit) pill(ctx, "弃权", 790, y, RED, 12);
      });
    }
    panel(ctx, 924, 420, 934, 505, "队伍常用英雄");
    const leftHeroes = teamHeroes(left.name).slice(0, 6);
    const rightHeroes = teamHeroes(right.name).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const y = 505 + i * 62;
      const lh = leftHeroes[i], rh = rightHeroes[i];
      if (lh) {
        text(ctx, lh.hero, 956, y, 22, 800, BLUE);
        text(ctx, `${lh.teamPicks.find((item) => item.team === left.name)?.picks || 0} 场`, 1140, y, 15, 600, MUTED);
      }
      if (rh) {
        text(ctx, rh.hero, 1260, y, 22, 800, RED);
        text(ctx, `${rh.teamPicks.find((item) => item.team === right.name)?.picks || 0} 场`, 1430, y, 15, 600, MUTED);
      }
    }
    if (!leftHeroes.length && !rightHeroes.length) {
      text(ctx, "双方暂无完整英雄数据", 1390, 650, 26, 700, MUTED, "center");
    }
    footer(ctx, insights.dataQuality);
  }

  function drawPlayers(ctx) {
    base(ctx, "选手英雄池", "首发五路 · 每名选手前三英雄");
    const left = teamById(insights.headToHead.leftId);
    const right = teamById(insights.headToHead.rightId);
    if (!left || !right) {
      empty(ctx, "请选择两支可用的队伍");
      footer(ctx, insights.dataQuality);
      return;
    }
    [["left", left, 62, BLUE], ["right", right, 962, RED]].forEach(([side, team, x, color]) => {
      panel(ctx, x, 136, 896, 814);
      text(ctx, team.name, x + 26, 176, 28, 800, color);
      const players = insights.players.filter((player) => player.team === team.name).slice(0, 5);
      if (!players.length) {
        text(ctx, "暂无选手数据", x + 448, 520, 26, 700, MUTED, "center");
        return;
      }
      players.forEach((player, index) => {
        const y = 225 + index * 140;
        rr(ctx, x + 20, y, 856, 120, 14);
        ctx.fillStyle = "rgba(255,255,255,.045)";
        ctx.fill();
        text(ctx, initials(player.player), x + 68, y + 44, 24, 800, color, "center");
        fit(ctx, player.player, x + 105, y + 34, 220, 24, 800, WHITE);
        text(ctx, `${player.games} 场 · ${pctText(player.winRate)}${player.smallSample ? " · 小样本" : ""}`, x + 105, y + 74, 15, 600, MUTED);
        const heroes = player.heroes.slice(0, 3);
        heroes.forEach((hero, heroIndex) => {
          const hx = x + 365 + heroIndex * 158;
          rr(ctx, hx, y + 22, 144, 76, 10);
          ctx.fillStyle = "rgba(255,255,255,.05)";
          ctx.fill();
          fit(ctx, hero.hero, hx + 72, y + 43, 128, 18, 800, color, "center");
          text(ctx, `${hero.games}场 ${pctText(hero.winRate)}`, hx + 72, y + 72, 13, 600, MUTED, "center");
        });
      });
    });
    footer(ctx, insights.dataQuality);
  }

  function drawHeroes(ctx) {
    base(ctx, "BP 与英雄热度", "Pick · Ban · Presence · 小样本明确标注");
    const heroes = insights.heroes.slice(0, 10);
    if (!heroes.length) {
      empty(ctx, "还没有完整的 10 人英雄选择数据");
      footer(ctx, insights.dataQuality);
      return;
    }
    panel(ctx, 62, 136, 1170, 814, "英雄热度排行榜");
    const maxRate = Math.max(...heroes.map((hero) => hero.presenceRate || 0), 1);
    heroes.forEach((hero, index) => {
      const y = 205 + index * 67;
      text(ctx, String(index + 1).padStart(2, "0"), 88, y, 16, 800, GOLD);
      fit(ctx, hero.hero, 135, y, 220, 22, 800, WHITE);
      text(ctx, `Pick ${hero.picks}`, 370, y, 15, 700, BLUE);
      text(ctx, `Ban ${hero.bans}`, 485, y, 15, 700, RED);
      text(ctx, `胜率 ${pctText(hero.winRate)}`, 600, y, 15, 600, MUTED);
      const barX = 780, barW = 350;
      rr(ctx, barX, y - 8, barW, 16, 8);
      ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
      rr(ctx, barX, y - 8, barW * ((hero.presenceRate || 0) / maxRate), 16, 8);
      ctx.fillStyle = GOLD; ctx.fill();
      text(ctx, pctText(hero.presenceRate), 1152, y, 17, 800, GOLD, "right");
      if (hero.smallSample) pill(ctx, "小样本", 1190, y, RED, 11);
    });
    panel(ctx, 1256, 136, 602, 390, "双方常用");
    [insights.headToHead.leftName, insights.headToHead.rightName].forEach((teamName, side) => {
      const y = 210 + side * 150;
      text(ctx, teamName, 1288, y, 21, 800, side ? RED : BLUE);
      teamHeroes(teamName).slice(0, 3).forEach((hero, index) => {
        const count = hero.teamPicks.find((item) => item.team === teamName)?.picks || 0;
        text(ctx, `${hero.hero} · ${count} 场`, 1288 + index * 178, y + 42, 16, 600, MUTED);
      });
    });
    panel(ctx, 1256, 550, 602, 400, "说明");
    wrap(ctx, "Presence = Pick + Ban 占比；样本少于 3 场的使用“小样本”标记。弃权、判负和缺失局不进入英雄分母。", 1288, 620, 535, 34, 20, 500, MUTED);
    text(ctx, `有效局：${insights.dataQuality.validGames}`, 1288, 790, 25, 800, GOLD);
    text(ctx, `缺失/冲突：${insights.dataQuality.missingGames}/${insights.dataQuality.conflictGames}`, 1288, 830, 18, 600, MUTED);
    footer(ctx, insights.dataQuality);
  }

  function drawPoster(ctx) {
    const w = 1080, h = 1350;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#141b2b");
    bg.addColorStop(.55, "#101827");
    bg.addColorStop(1, "#090e18");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .5, 240, 20, w * .5, 240, 520);
    glow.addColorStop(0, "rgba(216,179,91,.22)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(216,179,91,.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, w - 84, h - 84);
    pill(ctx, "PKC SEASON REPORT", 78, 92, GOLD, 14);
    fit(ctx, insights.meta.seriesName || "PKC 赛季", 78, 170, w - 156, 44, 800, WHITE);
    text(ctx, insights.meta.champion ? "赛季冠军：" + insights.meta.champion : "赛季进行中", 78, 232, 29, 800, insights.meta.champion ? GOLD : BLUE);
    if (!insights.meta.champion) text(ctx, `冠军尚未产生 · 剩余 ${insights.meta.remainingTeams} 支队伍 · 以赛程赛果为准`, 78, 274, 18, 500, MUTED);
    ctx.fillStyle = "rgba(216,179,91,.4)";
    ctx.fillRect(78, 310, w - 156, 1.5);

    text(ctx, "队伍战绩", 78, 365, 20, 800, GOLD);
    insights.teams.slice(0, 4).forEach((team, index) => {
      const y = 420 + index * 74;
      text(ctx, String(team.rank), 82, y, 20, 800, GOLD);
      fit(ctx, team.name, 132, y, 550, 26, 800, WHITE);
      text(ctx, `${team.wins}胜 ${team.losses}负`, 890, y, 22, 700, index ? RED : BLUE, "right");
    });
    text(ctx, "MVP 候选 · 按出场与胜场", 78, 760, 20, 800, GOLD);
    const mvp = insights.mvp.slice(0, 3);
    if (!mvp.length) text(ctx, "暂无完整选手数据", 78, 824, 22, 600, MUTED);
    mvp.forEach((player, index) => {
      const y = 820 + index * 64;
      text(ctx, String(index + 1).padStart(2, "0"), 82, y, 17, 800, GOLD);
      fit(ctx, player.player, 130, y, 310, 24, 800, WHITE);
      text(ctx, player.team, 455, y, 16, 600, MUTED);
      text(ctx, `${player.games} 场`, 855, y, 16, 600, MUTED);
      text(ctx, `${player.wins} 胜`, 982, y, 16, 700, BLUE, "right");
    });
    text(ctx, "高频英雄", 78, 1040, 20, 800, GOLD);
    insights.heroes.slice(0, 4).forEach((hero, index) => {
      const y = 1100 + index * 42;
      fit(ctx, hero.hero, 82, y, 260, 21, 700, WHITE);
      text(ctx, `P ${hero.picks} · B ${hero.bans}`, 400, y, 17, 700, MUTED);
      text(ctx, `Presence ${pctText(hero.presenceRate)}`, 920, y, 17, 800, GOLD, "right");
    });
    text(ctx, `有效 ${insights.dataQuality.validGames} 局 · 缺失 ${insights.dataQuality.missingGames} · 弃权 ${insights.meta.forfeitMatches}`, w / 2, 1306, 15, 600, "rgba(255,255,255,.45)", "center");
  }

  const DRAWERS = {
    overview: drawOverview,
    teams: drawTeams,
    compare: drawCompare,
    players: drawPlayers,
    heroes: drawHeroes,
    poster: drawPoster,
  };
  const NAMES = {
    overview:"赛季总览", teams:"队伍状态", compare:"双方对比",
    players:"选手英雄池", heroes:"BP与英雄热度", poster:"赛季总结海报",
  };

  function drawAll() {
    PAGES.forEach(([kind, id]) => {
      const canvas = $(id);
      const ctx = canvasSetup(canvas);
      DRAWERS[kind](ctx);
    });
    renderSummary();
  }

  function renderSummary() {
    const q = insights.dataQuality;
    const summary = $("seasonSummary");
    summary.innerHTML = `
      <div class="kpi"><span>已确认赛果</span><b>${insights.meta.officialMatches}</b></div>
      <div class="kpi"><span>有效对局</span><b>${q.validGames}</b></div>
      <div class="kpi"><span>参赛队伍</span><b>${insights.teams.length}</b></div>
      <div class="kpi"><span>弃权/判负</span><b>${insights.meta.forfeitMatches}</b></div>
      <div class="kpi"><span>淘汰赛进度</span><b>${insights.meta.stageProgress.completed}/${insights.meta.stageProgress.total}</b></div>`;
    const warnings = $("seasonWarnings");
    warnings.hidden = !insights.warnings.length;
    warnings.innerHTML = insights.warnings.map((warning) => "⚠ " + esc(warning.message)).join("<br>");
    $("seasonStatus").classList.remove("bad");
    $("seasonStatus").textContent = `已更新 · ${insights.meta.seriesName} · ${timeText(insights.meta.generatedAt)}`;
  }

  function renderTeamOptions(preserve = true) {
    const leftSelect = $("seasonLeft");
    const rightSelect = $("seasonRight");
    const left = preserve ? leftSelect.value : insights.headToHead.leftId;
    const right = preserve ? rightSelect.value : insights.headToHead.rightId;
    const options = insights.teams.map((team) => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join("");
    leftSelect.innerHTML = options;
    rightSelect.innerHTML = options;
    leftSelect.value = insights.teams.some((team) => team.id === left) ? left : insights.headToHead.leftId;
    rightSelect.value = insights.teams.some((team) => team.id === right) ? right : insights.headToHead.rightId;
    if (leftSelect.value === rightSelect.value && insights.teams.length > 1) {
      rightSelect.value = insights.teams.find((team) => team.id !== leftSelect.value)?.id || rightSelect.value;
    }
  }

  async function loadLibrary() {
    try {
      library = await fetch("/api/store/library", { cache:"no-store" }).then((response) => response.json());
    } catch {
      library = { series: [] };
    }
    const series = Array.isArray(library?.series) ? library.series : [];
    $("seasonSeries").innerHTML = series.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    if (library?.currentId) $("seasonSeries").value = library.currentId;
  }

  async function refresh() {
    const version = ++requestVersion;
    const seriesId = $("seasonSeries").value || library?.currentId || "";
    if (!seriesId) {
      $("seasonStatus").textContent = "没有可用的系列赛";
      $("seasonStatus").classList.add("bad");
      return;
    }
    const query = new URLSearchParams({
      seriesId,
      stage: $("seasonStage").value,
      leftId: $("seasonLeft").value,
      rightId: $("seasonRight").value,
    });
    $("seasonStatus").textContent = "正在计算赛季数据…";
    try {
      const response = await fetch("/api/season/insights?" + query, { cache:"no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "读取失败");
      if (version !== requestVersion) return;
      insights = result;
      renderTeamOptions(true);
      drawAll();
    } catch (error) {
      if (version !== requestVersion) return;
      $("seasonStatus").textContent = "生成失败：" + error.message;
      $("seasonStatus").classList.add("bad");
    }
  }

  function blobOf(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画布导出失败")), "image/png");
    });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeZip(files) {
    const encoder = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const crc = crc32(file.data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, file.data.length, true); lv.setUint32(22, file.data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, file.data);
      const header = new Uint8Array(46 + name.length);
      const cv = new DataView(header.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, file.data.length, true); cv.setUint32(24, file.data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      header.set(name, 46);
      central.push(header);
      offset += local.length + file.data.length;
    });
    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    const all = [...parts, ...central, end];
    const output = new Uint8Array(all.reduce((sum, item) => sum + item.length, 0));
    let position = 0;
    all.forEach((item) => { output.set(item, position); position += item.length; });
    return output;
  }
  async function exportAll() {
    if (!insights) return;
    const button = $("btnSeasonZip");
    button.disabled = true;
    button.textContent = "正在打包…";
    try {
      const files = [];
      for (const [kind, id] of PAGES) {
        const blob = await blobOf($(id));
        files.push({ name: `${insights.meta.seriesName}_${NAMES[kind]}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      download(new Blob([makeZip(files)], { type:"application/zip" }), `${insights.meta.seriesName}_赛季仪表盘.zip`);
      await fetch("/api/store/audit", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ action:"export-season-dashboard", key:"season", detail: insights.meta.seriesName }),
      }).catch(() => {});
    } finally {
      button.disabled = false;
      button.textContent = "打包下载全部 6 张";
    }
  }
  async function downloadOne(kind) {
    if (!insights) return;
    const entry = PAGES.find(([name]) => name === kind);
    if (!entry) return;
    download(await blobOf($(entry[1])), `${insights.meta.seriesName}_${NAMES[kind]}.png`);
  }
  function copySummary() {
    if (!insights) return;
    const lines = [
      `${insights.meta.seriesName} · 赛季仪表盘`,
      `官方赛果 ${insights.meta.officialMatches} 场，有效对局 ${insights.dataQuality.validGames} 局`,
      `当前状态：${insights.meta.champion ? "冠军 " + insights.meta.champion : "赛季进行中"}`,
      "前四队伍：" + insights.teams.slice(0, 4).map((team) => `${team.name} ${team.wins}胜${team.losses}负`).join("；"),
      "热门英雄：" + insights.heroes.slice(0, 4).map((hero) => `${hero.hero} Presence ${pctText(hero.presenceRate)}`).join("；"),
    ];
    navigator.clipboard?.writeText(lines.join("\n"));
    $("seasonStatus").textContent = "文字摘要已复制";
  }

  async function init() {
    await loadLibrary();
    const context = await fetch("/api/competition/context", { cache:"no-store" }).then((response) => response.json()).catch(() => ({}));
    if (context?.seriesId) $("seasonSeries").value = context.seriesId;
    ["seasonSeries","seasonStage","seasonLeft","seasonRight"].forEach((id) => $(id).addEventListener("change", refresh));
    $("btnSeasonRefresh").onclick = refresh;
    $("btnSeasonZip").onclick = exportAll;
    $("btnSeasonText").onclick = copySummary;
    document.querySelectorAll("[data-download]").forEach((button) => {
      button.onclick = () => downloadOne(button.dataset.download);
    });
    await refresh();
  }

  window.PKC_SEASON = {
    refresh,
    insights: () => insights,
    drawAll,
    exportAll,
  };
  init();
})();
