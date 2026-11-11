import assert from "node:assert/strict";
import test from "node:test";
import type { Match, MatchAnalysis, Shot, ShotTypeName } from "../contract.ts";
import { matchFixture, shot as shotFixture, typedAnalysisFixture } from "../test-fixtures.ts";
import { exploreShots, hitZone, shotOutcome } from "./shot-explorer.ts";

const make = (over: Partial<Shot> & Record<string, unknown> = {}) => ({ ...shotFixture(0, 1), ...over }) as unknown as Shot;
const typed = (name: ShotTypeName, probability = 0.9) => ({ name, probability, runnerUp: "drop" as const, runnerUpProbability: 0.05 });

test("hit zones are read from the hitter's own view, facing the net", () => {
  // Near end (camera end): the hitter's left is the camera's left, x = 0.
  assert.equal(hitZone(make({ hitterEnd: "near", contact: [5.5, 13, 2.5] })), "rear-right");
  assert.equal(hitZone(make({ hitterEnd: "near", contact: [0.5, 7.5, 1] })), "front-left");
  assert.equal(hitZone(make({ hitterEnd: "near", contact: [1, 10, 1] })), "mid-left");
  // Far end: the court is rotated 180°, so the camera's left is the hitter's right.
  assert.equal(hitZone(make({ hitterEnd: "far", contact: [0.5, 0.4, 2.5] })), "rear-right");
  assert.equal(hitZone(make({ hitterEnd: "far", contact: [5.5, 6, 1] })), "front-left");
  // A contact reconstructed just over the net still counts as the front.
  assert.equal(hitZone(make({ hitterEnd: "near", contact: [4, 6.5, 1.8] })), "front-right");
});

test("the rally's last racket shot is a winner or an error by who won the point; earlier shots were returned", () => {
  const shots = [make({ hitter: "a" }), make({ hitter: "b" }), make({ hitter: "a", endContact: "ground" }), make({ hitter: null, startContact: "net" })];
  assert.equal(shotOutcome(shots, 0, "a"), "returned");
  assert.equal(shotOutcome(shots, 1, "a"), "returned");
  assert.equal(shotOutcome(shots, 2, "a"), "winner");
  assert.equal(shotOutcome(shots, 2, "b"), "error");
  assert.equal(shotOutcome(shots, 2, undefined), "unknown");
});

function explorerData() {
  const match = matchFixture() as Match;
  const analysis = typedAnalysisFixture() as MatchAnalysis;
  // r1 is won by b: a smashes from rear right (returned), b lifts, a smashes again and loses the point.
  analysis.rallies.r1.shots = [
    make({ hitter: "a", hitterEnd: "near", contact: [5.5, 13, 2.8], speed: 80, shotType: typed("smash") }),
    make({ hitter: "b", hitterEnd: "far", contact: [3, 2, 1], shotType: typed("lift") }),
    make({ hitter: "a", hitterEnd: "near", contact: [5.6, 12.8, 2.7], speed: 90, endContact: "net", shotType: typed("smash") }),
  ];
  // r2 (winner unknown): a guessed smash, an unreliable one, and a smash from the front.
  analysis.rallies.r2 = { shots: [
    make({ hitter: "a", hitterEnd: "near", contact: [5.5, 13, 2.8], shotType: typed("smash", 0.3) }),
    make({ hitter: "a", hitterEnd: "near", contact: [5.5, 13, 2.8], quality: "unreliable", shotType: typed("smash") }),
    make({ hitter: "a", hitterEnd: "near", contact: [1, 7.5, 2.2], speed: 70, shotType: typed("smash") }),
  ], summary: analysis.rallies.r1.summary };
  return { match, analysis };
}

test("exploring filters by player, stroke type and hit zone, and links each shot back to its rally", () => {
  const { match, analysis } = explorerData();
  const result = exploreShots(match, analysis, { player: "a", type: "smash", zone: "rear-right" });
  assert.deepEqual(result.shots.map((s) => [s.ref.rallyId, s.ref.index, s.rallyIndex, s.outcome]), [["r1", 0, 0, "returned"], ["r1", 2, 0, "error"]]);
  assert.deepEqual(result.tally, { shots: 2, winners: 0, errors: 1, returned: 1, medianKmh: 306 });
  assert.equal(result.leftOut.unreliable, 1);
  assert.equal(result.leftOut.uncertainType, 1);
});

test("zone and type counts reflect the other filters so the controls show what is there", () => {
  const { match, analysis } = explorerData();
  const result = exploreShots(match, analysis, { player: "a", type: "smash", zone: "all" });
  assert.equal(result.shots.length, 3);
  assert.equal(result.zoneCounts["rear-right"], 2);
  assert.equal(result.zoneCounts["front-left"], 1);
  assert.equal(result.zoneCounts["mid-left"], 0);
  assert.equal(exploreShots(match, analysis, { player: "a", type: "all", zone: "rear-right" }).typeCounts.smash, 2);
  assert.equal(exploreShots(match, analysis, { player: "b", type: "all", zone: "all" }).typeCounts.lift, 1);
});
