import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch } from "../contract.ts";
import { matchFixture } from "../test-fixtures.ts";
import { bandPosition, groupByGame } from "./summary.ts";

test("rallies group by game in match order", () => {
  assert.deepEqual(groupByGame(parseMatch(matchFixture())), [{ game: 1, indices: [0, 1] }, { game: 2, indices: [2] }]);
});

test("band position compares a value with the middle 80%", () => {
  const stats = { n: 10, median: 5, p10: 2, p90: 8 };
  assert.equal(bandPosition(9, stats), "above");
  assert.equal(bandPosition(5, stats), "within");
  assert.equal(bandPosition(1, stats), "below");
  assert.equal(bandPosition(null, stats), null);
  assert.equal(bandPosition(5, { n: 0 }), null);
});
