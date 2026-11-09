import assert from "node:assert/strict";
import test from "node:test";
import type { Shot } from "../contract.ts";
import { shot as shotFixture } from "../test-fixtures.ts";
import { CAMERA_PRESETS, cameraPreset, replayDuration, replayKeyAction, replayTime, toScene, trailIndex } from "./replay.ts";

const flight = shotFixture(10, 11) as unknown as Shot; // path 10 → 11 s
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test("court points map to y-up scene coordinates centred on the net", () => {
  assert.deepEqual(toScene([3.05, 6.7, 1.524]), [0, 1.524, 0]);
  assert.deepEqual(toScene([0, 0, 0]), [-3.05, 0, -6.7]);
});

test("the replay loops through the flight and holds at the landing", () => {
  close(replayDuration(flight), 1.6);
  assert.equal(replayTime(flight, 0, 1), 10);
  assert.equal(replayTime(flight, 0.5, 1), 10.5);
  assert.equal(replayTime(flight, 1.3, 1), 11); // in the hold
  close(replayTime(flight, 1.7, 1), 10.1); // looped
  assert.equal(replayTime(flight, 2, 0.25), 10.5); // speed scales elapsed time
});

test("degenerate paths stay finite", () => {
  const single = { ...flight, path: [[10, 3, 2, 1]] } as Shot;
  close(replayDuration(single), 0.6);
  assert.equal(replayTime(single, 5, 1), 10);
  assert.equal(trailIndex(single, 10), 1);
});

test("the trail includes every sample up to the playhead", () => {
  assert.equal(trailIndex(flight, 9.9), 0);
  assert.equal(trailIndex(flight, 10), 1);
  assert.equal(trailIndex(flight, 10.99), 1);
  assert.equal(trailIndex(flight, 11), 2);
});

test("every camera preset is finite and aims inside the court", () => {
  const vertical = { ...flight, contact: [3, 5, 1], end: [3, 5, 0], path: [[10, 3, 5, 1], [11, 3, 5, 0]] } as Shot;
  for (const shot of [flight, vertical]) {
    for (const name of CAMERA_PRESETS) {
      const { position, target } = cameraPreset(name, shot);
      assert.ok([...position, ...target].every(Number.isFinite), name);
      assert.ok(Math.abs(target[0]) <= 3.05 + 1e-9 && Math.abs(target[2]) <= 6.7 + 1e-9 && target[1] >= 0, name);
      assert.ok(position[1] > 0, `${name} camera is above the floor`);
    }
  }
});

test("the hitter camera stands behind the contact, looking toward the landing", () => {
  // Hit from the far end (scene z < 0) toward the camera end: the camera is further toward the far end.
  const { position, target } = cameraPreset("hitter", flight);
  assert.ok(position[2] < toScene(flight.contact)[2]);
  assert.ok(target[2] > position[2]);
});

test("replay keys never steal a focused control's own keys", () => {
  const at = { index: 3, count: 10, hasPath: true };
  assert.equal(replayKeyAction(" ", "other", at), "toggle");
  assert.equal(replayKeyAction(" ", "button", at), null); // Space activates the focused button
  assert.equal(replayKeyAction(" ", "input", at), null);
  assert.equal(replayKeyAction("ArrowRight", "button", at), "next");
  assert.equal(replayKeyAction("ArrowLeft", "other", at), "previous");
  assert.equal(replayKeyAction("ArrowLeft", "input", at), null); // the scrub slider uses arrows
  assert.equal(replayKeyAction("Escape", "input", at), "close");
  assert.equal(replayKeyAction("ArrowLeft", "other", { ...at, index: 0 }), null);
  assert.equal(replayKeyAction("ArrowRight", "other", { ...at, index: 9 }), null);
  assert.equal(replayKeyAction(" ", "other", { ...at, hasPath: false }), null);
});
