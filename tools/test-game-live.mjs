import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { buildGameLive, GAME_BACKGROUNDS, gameLiveSelectionKey } from "../lib/game-live.mjs";

const context = { seriesId: "series", matchKey: "R16-1", gameId: "2", blueId: "a", redId: "b" };
const library = { series: [{ id: "series", teams: [{ id: "a", name: "甲队" }, { id: "b", name: "乙队" }] }] };
const game = (id, ourId, oppId, result, ourScore = "12") => ({
  id, matchKey: "R16-1", ourId, oppId, result, ourScore, oppScore: "5",
});
const games = [
  game("1", "a", "b", "win"),
  game("2", "b", "a", "lose", "0"),
  game("3", "a", "b", "lose"),
  game("4", "a", "b", "win", ""),
  game("5", "a", "c", "win"),
  { ...game("6", "a", "b", "win"), matchKey: "R16-2" },
];
const matches = { games: { series: games } };
const blue = { name: "乙队", score: 1 };
const red = { name: "甲队", score: 2 };
assert.deepEqual(buildGameLive(context, library, matches), { blue, red, assigned: true, swapped: false });
assert.deepEqual(buildGameLive(context, library, matches, true), { blue: red, red: blue, assigned: true, swapped: true });
assert.equal(buildGameLive(context, library, { games: { series: [games[3]] } }).blue.score, 0);
assert.equal(buildGameLive(null, library, matches).blue.score, null);
assert.notEqual(gameLiveSelectionKey(context), gameLiveSelectionKey({ ...context, gameId: "3" }));

assert.equal(GAME_BACKGROUNDS.length, 9);
for (const preset of GAME_BACKGROUNDS) {
  assert.ok(existsSync(new URL(`../直播素材/${preset.file}`, import.meta.url)), preset.id);
  const [x, y, w, h] = preset.capture;
  assert.ok(x >= 0 && y >= 0 && x + w <= 1920 && y + h <= 1080, preset.id);
  for (const slot of preset.slots) {
    assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.width <= 1920 && slot.y + slot.height <= 1080, preset.id);
    assert.ok(slot.x + slot.width <= x || slot.x >= x + w || slot.y + slot.height <= y || slot.y >= y + h, preset.id);
  }
}
