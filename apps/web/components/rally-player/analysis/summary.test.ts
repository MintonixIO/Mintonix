import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysis, parseMatch, type Shot } from "../contract.ts";
import { analysisFixture, matchFixture, shot as shotFixture } from "../test-fixtures.ts";
import { bandPosition, gameSummaries, rallySummary } from "./summary.ts";

test("a rally summary counts shots per player and skips unreliable shots for the records", () => {
  const shots = [
    { ...shotFixture(10, 11), speed: 30, apex: 2 },
    { ...shotFixture(11, 12, "b"), speed: 90, apex: 9, quality: "unreliable" },
    { ...shotFixture(12, 13, "b"), speed: 40, apex: 5 },
    { ...shotFixture(13, 14, null), speed: null, apex: null },
  ] as unknown as Shot[];
  const summary = rallySummary(shots);
  assert.equal(summary.shots, 4);
  assert.equal(summary.unreliable, 1);
  assert.deepEqual(summary.byPlayer, { a: 1, b: 2 });
  assert.equal(summary.fastest, 2);
  assert.equal(summary.highest, 2);
  assert.equal(summary.last, shots[3]);
  assert.equal(rallySummary([]).fastest, -1);
});

test("game summaries give the final score and winner only when the last rally allows it", () => {
  const input = matchFixture();
  input.rallies[1].scoreBefore = { a: 20, b: 19 };
  input.rallies[1].winner = "a";
  const match = parseMatch(input);
  const analysis = parseAnalysis(analysisFixture(), match);
  const [first, second] = gameSummaries(match, analysis);
  assert.deepEqual(first.indices, [0, 1]);
  assert.deepEqual(first.final, { a: 21, b: 19 });
  assert.equal(first.winner, "a");
  assert.equal(first.longest, 0);
  assert.equal(first.averageShots, 1);
  assert.equal(second.final, null);
  assert.equal(second.winner, null);
  assert.equal(second.longest, -1);
  assert.equal(gameSummaries(match)[0].averageShots, null);
});

test("band position compares a value with the middle 80%", () => {
  const stats = { n: 10, median: 5, p10: 2, p90: 8 };
  assert.equal(bandPosition(9, stats), "above");
  assert.equal(bandPosition(5, stats), "within");
  assert.equal(bandPosition(1, stats), "below");
  assert.equal(bandPosition(null, stats), null);
  assert.equal(bandPosition(5, { n: 0 }), null);
});
