import assert from "node:assert/strict";
import test from "node:test";
import { encodeRun, skeletonFrame } from "../test-fixtures.ts";
import { decodeRun } from "./motion.ts";
import { RACKET_LENGTH, racketHand, racketPose } from "./racket.ts";

const LEFT_WRIST = 13;
const RIGHT_WRIST = 16;

/** Frames of a standing player whose `wrist` swings `swing` cm along x at frames 8–12. */
function swingRun(wrist: number, swing: number) {
  const frames = Array.from({ length: 20 }, (_, f) => {
    const joints = skeletonFrame(300, 300);
    if (f >= 8 && f <= 12) joints[wrist] = [joints[wrist][0] + (f - 8) * swing, joints[wrist][1], joints[wrist][2]];
    return joints;
  });
  return decodeRun(encodeRun(100, frames));
}

test("the racket hand is the wrist that moves faster around the player's own hits", () => {
  assert.equal(racketHand([swingRun(RIGHT_WRIST, 20)], 30, [110 / 30]), "right");
  assert.equal(racketHand([swingRun(LEFT_WRIST, 20)], 30, [110 / 30]), "left");
});

test("without hits in the runs, the wrist that travels further holds the racket", () => {
  assert.equal(racketHand([swingRun(LEFT_WRIST, 20)], 30, []), "left");
  assert.equal(racketHand([swingRun(RIGHT_WRIST, 20)], 30, [50]), "right");
  assert.equal(racketHand([], 30, []), null);
});

test("away from a hit the racket points along the forearm from the wrist", () => {
  const pose = decodeRun(encodeRun(0, [skeletonFrame(300, 300), skeletonFrame(300, 300)])).joints.subarray(0, 51);
  const { grip, tip } = racketPose(pose, "right", 5, null);
  // Right elbow (-30, 0, 30) → wrist (-30, 0, 10) cm from the hip: straight down.
  assert.deepEqual(grip.map((v) => Math.round(v * 100)), [270, 300, 105]);
  assert.ok(Math.abs(tip[2] - (grip[2] - RACKET_LENGTH)) < 1e-6);
  assert.ok(Math.abs(tip[0] - grip[0]) < 1e-6);
});

test("at the moment of a hit the racket reaches towards the contact point", () => {
  const pose = decodeRun(encodeRun(0, [skeletonFrame(300, 300), skeletonFrame(300, 300)])).joints.subarray(0, 51);
  const contact = { time: 5, point: [2.7, 3, 3] as [number, number, number] };
  const at = racketPose(pose, "right", 5, contact);
  assert.ok(at.tip[2] > at.grip[2] + RACKET_LENGTH * 0.99, "points straight up at the contact");
  const length = Math.hypot(at.tip[0] - at.grip[0], at.tip[1] - at.grip[1], at.tip[2] - at.grip[2]);
  assert.ok(Math.abs(length - RACKET_LENGTH) < 1e-6);
  const later = racketPose(pose, "right", 5.2, contact);
  assert.ok(later.tip[2] < later.grip[2], "back along the forearm 0.2 s later");
});
