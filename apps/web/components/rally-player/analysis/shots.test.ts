import assert from "node:assert/strict";
import test from "node:test";
import type { MatchAnalysis, Shot } from "../contract.ts";
import { analysisFixture, shot as shotFixture } from "../test-fixtures.ts";
import { activeShotIndex, formatShotParam, kmh, netClearance, parseShotParam, qualityNote, resolveShot, shotCueTime, shuttleAt } from "./shots.ts";

const shots = [shotFixture(10, 11), shotFixture(11, 12.5, "b")] as unknown as Shot[];

test("the active shot is the last one that has started", () => {
  assert.equal(activeShotIndex(shots, 9), -1);
  assert.equal(activeShotIndex(shots, 10), 0);
  assert.equal(activeShotIndex(shots, 10.9), 0);
  assert.equal(activeShotIndex(shots, 11), 1);
  assert.equal(activeShotIndex(shots, 20), 1);
});

test("the shuttle position interpolates along the path and is null outside the flight", () => {
  assert.deepEqual(shuttleAt(shots[0], 10), [3, 2, 1]);
  const mid = shuttleAt(shots[0], 10.5)!;
  assert.deepEqual(mid.map((v) => Math.round(v * 100) / 100), [3, 6.5, 0.9]);
  assert.equal(shuttleAt(shots[0], 9.9), null);
  assert.equal(shuttleAt(shots[0], 11.1), null);
  assert.equal(shuttleAt({ ...shots[0], path: [] }, 10.5), null);
});

test("speeds convert to km/h and quality notes explain unreliable shots in plain language", () => {
  assert.equal(kmh(20), 72);
  assert.equal(kmh(null), null);
  assert.equal(qualityNote(shots[0]), null);
  assert.match(qualityNote({ ...shots[0], quality: "unreliable", issues: ["camera_cut", "unrecovered"] })!, /camera cut away during the flight; the shuttle/);
  assert.match(qualityNote({ ...shots[0], quality: "guessed", issues: ["guessed_contact"] })!, /estimated/);
});

test("a flight crossing below the net top without hitting it has no reliable clearance", () => {
  assert.equal(netClearance(shots[0]), 0.4);
  assert.equal(netClearance({ ...shots[0], netClearance: -0.25 }), null);
  assert.equal(netClearance({ ...shots[0], netClearance: -0.1, endContact: "net" }), -0.1);
  assert.equal(netClearance({ ...shots[0], netClearance: null }), null);
});

test("shot params round-trip with a 1-based shot number", () => {
  assert.equal(formatShotParam({ rallyId: "r12", index: 2 }), "r12.3");
  assert.deepEqual(parseShotParam("r12.3"), { rallyId: "r12", index: 2 });
  assert.deepEqual(parseShotParam("g1_r-4.10"), { rallyId: "g1_r-4", index: 9 });
});

test("malformed shot params are ignored", () => {
  for (const value of [null, "", "r1", "r1.", "r1.0", "r1.-1", "r1.1.2", "R1.1", "r1.1x", ".1"]) {
    assert.equal(parseShotParam(value), null, String(value));
  }
});

test("a shot ref resolves only to a shot that exists", () => {
  const analysis = analysisFixture() as unknown as MatchAnalysis;
  assert.equal(resolveShot(analysis, { rallyId: "r1", index: 1 })?.shot.hitter, "b");
  assert.equal(resolveShot(analysis, { rallyId: "r1", index: 2 }), null);
  assert.equal(resolveShot(analysis, { rallyId: "r2", index: 0 }), null);
  assert.equal(resolveShot(analysis, { rallyId: "nope", index: 0 }), null);
  assert.equal(resolveShot(undefined, { rallyId: "r1", index: 0 }), null);
  assert.equal(resolveShot(analysis, null), null);
});

test("the video is cued just before contact but never before the rally", () => {
  assert.equal(shotCueTime(9, shots[0]), 9.6);    // shot starts at 10 s
  assert.equal(shotCueTime(9.8, shots[0]), 9.8);  // clamped to the rally start
});
