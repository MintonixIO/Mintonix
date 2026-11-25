/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are plain objects */
import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch, parseRallyMotion, type Shot } from "../contract.ts";
import { matchFixture, rallyMotionFixture, shot, skeletonFrame } from "../test-fixtures.ts";
import { decodeMotion, distanceSoFar, frameAt, poseAt, TAG_SECONDS, tagAt, tagText } from "./motion.ts";

const match = parseMatch(matchFixture());
const skeletons = () => decodeMotion(parseRallyMotion(rallyMotionFixture(), match));

test("decoding restores every joint in metres, exactly", () => {
  const pose = poseAt(skeletons().players.a, 1025)!;
  const expected = skeletonFrame(250, 300).flat().map((cm) => cm / 100);
  assert.equal(pose.length, 51);
  expected.forEach((value, i) => assert.ok(Math.abs(pose[i] - value) < 1e-6, `joint value ${i}`));
});

test("a player has no pose outside their runs", () => {
  const { players } = skeletons();
  assert.equal(poseAt(players.a, 1019), null);
  assert.ok(poseAt(players.a, 1030));
  assert.equal(poseAt(players.a, 1031), null);                 // the run is 11 frames, 1020–1030
  assert.equal(poseAt(players.b, 1100), null);                 // between b's two runs
  assert.ok(poseAt(players.b, 1261));
  assert.equal(poseAt(undefined, 1025), null);                 // a player without a track
});

test("a fractional frame blends the frames around it, inside a run only", () => {
  const { players } = skeletons();
  const a = poseAt(players.a, 1025)!, b = poseAt(players.a, 1026)!;
  const half = poseAt(players.a, 1025.5)!;
  half.forEach((value, i) => assert.ok(Math.abs(value - (a[i] + b[i]) / 2) < 1e-5, `joint value ${i}`));
  assert.deepEqual(poseAt(players.a, 1030.5), poseAt(players.a, 1030)); // last frame of the run holds
  assert.equal(poseAt(players.a, 1019.5), null);                          // just before the run starts
});

test("frames are picked by the playhead at the file's frame rate", () => {
  assert.equal(frameAt(34, 30), 1020);
  assert.equal(frameAt(34.0333, 30), 1020);
  assert.equal(frameAt(34 + 1 / 30, 30), 1021);
});

test("distance grows along the run and reaches the Engine's figure at its end", () => {
  const s = skeletons();
  assert.equal(distanceSoFar(s, "a", 1000), 0);
  assert.ok(Math.abs(distanceSoFar(s, "a", 1025)! - 0.5) < 1e-6);
  assert.equal(distanceSoFar(s, "a", 1030), 1);
  assert.equal(distanceSoFar(s, "a", 2000), 1);
  assert.equal(distanceSoFar(s, "b", 1300), 0);                 // stood still
  assert.equal(distanceSoFar(s, "c", 1300), null);              // no track at all
});

function rallyShots(): Shot[] {
  const shots = [shot(34.5, 35.3), shot(35.3, 36, "b"), shot(36, 36.6)] as any[];
  shots[0].shotType = { name: "smash", probability: 0.9, runnerUp: "drop", runnerUpProbability: 0.05 };
  shots[0].speed = 86.7;
  shots[1].shotType = { name: "lift", probability: 0.4, runnerUp: "clear", runnerUpProbability: 0.35 };
  shots[1].quality = "unreliable";
  return shots;
}

test("a tag shows from contact until it fades or the next hit", () => {
  const shots = rallyShots();
  assert.equal(tagAt(shots, 34.4), null);
  assert.equal(tagAt(shots, 34.5), 0);
  assert.equal(tagAt(shots, 35.29), 0);                        // the next hit comes before the fade
  assert.equal(tagAt(shots, 35.3), 1);
  assert.equal(tagAt(shots, 36 + TAG_SECONDS + 0.01), null);   // faded after the last hit
  const net = rallyShots();
  net[1].startContact = "net";
  net[1].hitter = null;
  assert.equal(tagAt(net, 35.4), null);                        // a net-cord continuation is no hit
});

test("tags name the stroke and its speed, mark unsure picks and hide unreliable numbers", () => {
  const shots = rallyShots();
  assert.equal(tagText(shots[0]), "SMASH · 312 km/h");
  assert.equal(tagText(shots[1]), "LIFT?");
  assert.equal(tagText(shots[2]), null);                       // no stroke type, no tag
  const unclear = rallyShots();
  unclear[0].shotType!.name = null;
  assert.equal(tagText(unclear[0]), null);
});
