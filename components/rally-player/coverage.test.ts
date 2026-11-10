import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch } from "./contract.ts";
import { formatPlayTime, gameResults, matchResult, missingPointsBefore, playSeconds, pointCoverage } from "./coverage.ts";
import { matchFixture } from "./test-fixtures.ts";

function matchWith(rallies: { game: number; score?: [number, number]; winner?: string; seconds?: number }[]) {
  const fixture = matchFixture();
  let start = 10;
  fixture.rallies = rallies.map((rally, index) => {
    const segment = [start, start + (rally.seconds ?? 5)];
    start += 20;
    return {
      id: `r${index + 1}`, game: rally.game, segments: [segment],
      ...(rally.score && { scoreBefore: { a: rally.score[0], b: rally.score[1] } }),
      ...(rally.winner && { winner: rally.winner }),
    };
  });
  return parseMatch(fixture);
}

test("play time is totalled once and rounded once", () => {
  const match = matchWith([{ game: 1, seconds: 10.4 }, { game: 1, seconds: 78.4 }]);
  assert.ok(Math.abs(playSeconds(match.rallies) - 88.8) < 1e-9);
  assert.equal(formatPlayTime(match.rallies), "1:29");
});

test("a score that advances by more than one point marks the points missing before that rally", () => {
  const match = matchWith([
    { game: 1, score: [0, 0] }, { game: 1, score: [1, 0] }, { game: 1, score: [1, 2] }, { game: 1, score: [4, 2] },
  ]);
  assert.deepEqual(missingPointsBefore(match.rallies), [0, 0, 1, 2]);
  assert.deepEqual(pointCoverage(match.rallies), { rallies: 4, missing: 3, played: 7 });
});

test("a game's first rally is compared with 0–0, and unknown scores claim nothing", () => {
  const match = matchWith([
    { game: 1, score: [0, 0] }, { game: 2, score: [1, 1] }, { game: 2 }, { game: 2, score: [5, 5] },
  ]);
  assert.deepEqual(missingPointsBefore(match.rallies), [0, 2, 0, 0]);
});

test("only games whose last rally completes them get a final score", () => {
  const match = matchWith([
    { game: 1, score: [20, 19], winner: "a" },
    { game: 2, score: [20, 20], winner: "b" },
    { game: 3, score: [29, 29], winner: "b" },
  ]);
  assert.deepEqual(gameResults(match), [
    { game: 1, score: { a: 21, b: 19 }, winner: "a" },
    { game: 3, score: { a: 29, b: 30 }, winner: "b" },
  ]);
  assert.deepEqual(gameResults(matchWith([{ game: 1, score: [12, 20] }, { game: 2, score: [3, 2], winner: "a" }])), []);
});

test("a match has a winner only once two completed games are theirs", () => {
  const decided = matchResult(matchWith([{ game: 1, score: [20, 19], winner: "a" }, { game: 2, score: [20, 10], winner: "a" }]));
  assert.equal(decided.winner, "a");
  assert.deepEqual(decided.gamesWon, { a: 2, b: 0 });
  assert.equal(matchResult(matchWith([{ game: 1, score: [20, 19], winner: "a" }, { game: 2, score: [5, 10], winner: "a" }])).winner, null);
});
