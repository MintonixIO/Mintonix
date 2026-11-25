import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch } from "./contract.ts";
import { matchFixture } from "./test-fixtures.ts";
import { rallyProgress, rallyScore, rallyStrip, rallyTip } from "./rally-strip.ts";

const match = parseMatch(matchFixture());

test("the strip groups rallies by game, weighted by their watchable seconds", () => {
  assert.deepEqual(rallyStrip(match.rallies, [0, 0, 0]), [
    { game: 1, weight: 29, items: [{ kind: "rally", index: 0, weight: 12 }, { kind: "rally", index: 1, weight: 17 }] },
    { game: 2, weight: 9, items: [{ kind: "rally", index: 2, weight: 9 }] },
  ]);
});

test("short rallies get the minimum weight so they stay clickable", () => {
  const fixture = matchFixture();
  fixture.rallies[2].segments = [[112, 112.5]];
  const [, second] = rallyStrip(parseMatch(fixture).rallies, [0, 0, 0]);
  assert.deepEqual(second.items, [{ kind: "rally", index: 2, weight: 4 }]);
  assert.equal(second.weight, 4);
});

test("points that weren't captured show as a break before the rally", () => {
  const [first] = rallyStrip(match.rallies, [0, 2, 0]);
  assert.deepEqual(first.items.map((item) => item.kind), ["rally", "missing", "rally"]);
  assert.deepEqual(first.items[1], { kind: "missing", count: 2 });
});

test("progress runs from 0 at the rally's start to 1 at its end, clamped outside it", () => {
  const rally = match.rallies[0];
  assert.equal(rallyProgress(rally, 30), 0);
  assert.equal(rallyProgress(rally, 34), 0);
  assert.equal(rallyProgress(rally, 41), 0.5);
  assert.equal(rallyProgress(rally, 48), 1);
  assert.equal(rallyProgress(rally, 200), 1);
});

test("score and tooltip read in player order, with gaps for what isn't known", () => {
  assert.equal(rallyScore(match, 0), "0–0");
  assert.equal(rallyScore(match, 1), "0–1");
  assert.equal(rallyScore(match, 2), "No score");
  assert.equal(rallyTip(match, 0), "G1 · 0–0 · 12 s · point to B");
  assert.equal(rallyTip(match, 1), "G1 · 0–1 · 17 s");
  assert.equal(rallyTip(match, 2), "G2 · No score · 9 s");
});
