import assert from "node:assert/strict";
import test from "node:test";
import { isSeekPending } from "./youtube.ts";

test("a slow forward seek keeps the requested rally while YouTube reports the old playhead", () => {
  const seek = { time: 72, startedAt: 1000 };
  assert.equal(isSeekPending(seek, 48, 1900), true);
  assert.equal(isSeekPending(seek, 48, 4500), true);
  assert.equal(isSeekPending(seek, 72, 4600), false);
});

test("keyframe pre-roll can play through without triggering another gap skip", () => {
  const seek = { time: 72, startedAt: 0 };
  assert.equal(isSeekPending(seek, 70, 1000), true);
  assert.equal(isSeekPending(seek, 71.5, 2500), true);
  assert.equal(isSeekPending(seek, 72.1, 3100), false);
});

test("a backward seek does not settle on the old later timestamp", () => {
  const seek = { time: 34, startedAt: 1000 };
  assert.equal(isSeekPending(seek, 831, 2000), true);
  assert.equal(isSeekPending(seek, 34.5, 2200), false);
});

test("settling accepts timestamp rounding and eventually releases a failed seek", () => {
  const seek = { time: 2026 / 30, startedAt: 0 };
  assert.equal(isSeekPending(seek, 67.533333, 1000), false);
  assert.equal(isSeekPending(seek, 10, 10_000), false);
});
