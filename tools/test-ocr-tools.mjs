import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OCR = require("../assets/ocr-tools.js");

const gearPage = {
  type: "gear",
  rows: {
    our: [
      { k: 1, d: 3, a: 0, gold: "5851", name: "无氧致死_" },
      { k: 1, d: 3, a: 0, gold: "5510", name: "jaylin^_^" },
      { k: 1, d: 3, a: 0, gold: "5771", name: "吃榴莲减肥快" },
      { k: 0, d: 2, a: 2, gold: "6494", name: "跳起来平抽。" },
      { k: 0, d: 3, a: 1, gold: "4552", name: "诗诉江南" },
    ],
    opp: [
      { k: 1, d: 0, a: 6, gold: "8466", name: "轻语" },
      { k: 2, d: 0, a: 5, gold: "7959", name: "柳橙姬" },
      { k: 0, d: 1, a: 0, gold: "6465", name: "布灵萌萌小叶" },
      { k: 6, d: 2, a: 5, gold: "7936", name: "xdcbaba" },
      { k: 5, d: 0, a: 7, gold: "6950", name: "世中逢尔" },
    ],
  },
};

const statsPage = {
  type: "stats",
  rows: {
    our: [
      { dmgRaw: 33700, tankRaw: 34900, goldRaw: 5851, dmgPct: 26, tankPct: 15, goldShare: 21, kp: 33 },
      { dmgRaw: 20700, tankRaw: 47500, goldRaw: 5510, dmgPct: 16, tankPct: 20, goldShare: 20, kp: 33 },
      { dmgRaw: 35000, tankRaw: 38400, goldRaw: 5771, dmgPct: 27, tankPct: 16, goldShare: 20, kp: 33 },
      { dmgRaw: 31500, tankRaw: 45800, goldRaw: 6494, dmgPct: 24, tankPct: 19, goldShare: 23, kp: 66 },
      { dmgRaw: 7900, tankRaw: 72500, goldRaw: 4552, dmgPct: 6, tankPct: 30, goldShare: 16, kp: 33 },
    ],
    opp: [
      { dmgRaw: 64600, tankRaw: 13000, goldRaw: 8466, dmgPct: 27, tankPct: 10, goldShare: 22, kp: 50 },
      { dmgRaw: 37300, tankRaw: 32200, goldRaw: 7959, dmgPct: 16, tankPct: 25, goldShare: 21, kp: 50 },
      { dmgRaw: 27700, tankRaw: 18700, goldRaw: 6465, dmgPct: 12, tankPct: 15, goldShare: 17, kp: 57 },
      { dmgRaw: 76500, tankRaw: 54700, goldRaw: 7936, dmgPct: 32, tankPct: 43, goldShare: 21, kp: 78 },
      { dmgRaw: 33100, tankRaw: 10100, goldRaw: 6950, dmgPct: 14, tankPct: 8, goldShare: 18, kp: 85 },
    ],
  },
};

test("parseKda repairs slash characters read as 7", () => {
  assert.deepEqual(OCR.parseKda("1/73/70"), [1, 3, 0]);
});

test("parse numeric units without multiplying an already-normalized k value twice", () => {
  assert.equal(OCR.parseKilo("33.7k"), 33700);
  assert.equal(OCR.parseKilo("315k"), 31500);
  assert.equal(OCR.parsePct("26%"), 26);
  assert.equal(OCR.parsePct("2.11"), null);
});

test("candidate voting prefers repeated evidence over one high-confidence outlier", () => {
  const picked = OCR.voteCandidates([
    { text: "5851", conf: 65, variant: "raw" },
    { text: "5851", conf: 60, variant: "light" },
    { text: "8851", conf: 88, variant: "gray" },
  ], "gold");
  assert.equal(picked.value, 5851);
  assert.ok(picked.support >= 2);
});

test("merging two client pages infers the score from KDA sums", () => {
  const merged = OCR.mergeClientPages([gearPage, statsPage], {});
  assert.equal(merged.kills.our, 3);
  assert.equal(merged.kills.opp, 14);
  assert.equal(merged.scores.our, "3");
  assert.equal(merged.scores.opp, "14");
  assert.equal(merged.rows.our[0].gold, "5851");
  assert.equal(merged.rows.opp[4].dmgPct, 14);
});

test("semantic validation reports a KDA total that disagrees with the entered score", () => {
  const merged = OCR.mergeClientPages([gearPage, statsPage], {
    scores: { our: "4", opp: "14" },
  });
  const issue = merged.issues.find(x => x.code === "score-kda-mismatch" && x.side === "our");
  assert.ok(issue);
  assert.match(issue.message, /4/);
  assert.match(issue.message, /3/);
});

test("semantic validation catches percentage sums that cannot belong to one team", () => {
  const bad = JSON.parse(JSON.stringify(statsPage));
  bad.rows.our[1].goldShare = 99;
  const merged = OCR.mergeClientPages([gearPage, bad], {});
  const issue = merged.issues.find(x => x.code === "share-sum" && x.side === "our");
  assert.ok(issue);
  assert.equal(issue.field, "goldShare");
});

test("semantic validation flags gold shares inconsistent with individual gold", () => {
  const bad = JSON.parse(JSON.stringify(statsPage));
  bad.rows.our[0].goldShare = 31;
  const merged = OCR.mergeClientPages([gearPage, bad], {});
  const issue = merged.issues.find(x => x.code === "gold-share-ratio" && x.side === "our" && x.row === 0);
  assert.ok(issue);
});

test("cross-page merge keeps the higher-confidence gold value and records the conflict", () => {
  const gear = JSON.parse(JSON.stringify(gearPage));
  const stats = JSON.parse(JSON.stringify(statsPage));
  gear.rows.our[0].gold = "5971";
  gear.conf = { our: [{ gold: 80 }], opp: [] };
  stats.rows.our[0].goldRaw = 5851;
  stats.conf = { our: [{ goldRaw: 95 }], opp: [] };
  const merged = OCR.mergeClientPages([gear, stats], {});
  assert.equal(merged.rows.our[0].gold, "5851");
  assert.ok(merged.issues.some(x => x.code === "gold-conflict" && x.side === "our" && x.row === 0));
});

test("missing percentage shares are repaired from raw teammate totals", () => {
  const incomplete = JSON.parse(JSON.stringify(statsPage));
  incomplete.rows.our[1].dmgPct = null;
  incomplete.rows.our[1].tankPct = null;
  incomplete.rows.our[1].goldShare = null;
  incomplete.rows.our[1].kp = null;
  const merged = OCR.mergeClientPages([gearPage, incomplete], {});
  const row = merged.rows.our[1];
  assert.ok(row.dmgPct > 15 && row.dmgPct < 17);
  assert.ok(row.tankPct > 19 && row.tankPct < 21);
  assert.ok(row.goldShare > 19 && row.goldShare < 21);
  assert.ok(row.kp > 30 && row.kp < 35);
  assert.ok(merged.corrections.some(x => x.code === "share-derived" && x.side === "our" && x.row === 1));
});

test("an implausible raw value is repaired from its percentage share", () => {
  const bad = JSON.parse(JSON.stringify(statsPage));
  bad.rows.our[1].tankRaw = 747500;
  bad.rows.our[1].tankPct = 20;
  const merged = OCR.mergeClientPages([gearPage, bad], {});
  assert.ok(merged.rows.our[1].tankRaw < 60000);
  assert.ok(merged.corrections.some(x => x.code === "raw-outlier" && x.side === "our" && x.row === 1));
});
