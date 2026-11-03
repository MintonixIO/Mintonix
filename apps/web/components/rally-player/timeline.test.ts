import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTimeline, gameplayAtSourceTime, normalizeMediaTime, parseRallyManifest, rallyPlaybackPosition, sourceAtGameplayTime } from "./timeline.ts";

const fixture = JSON.parse(readFileSync(new URL("../../../../contracts/examples/demo-match.json", import.meta.url), "utf8"));
const manifest = parseRallyManifest(fixture);
const timeline = createTimeline(manifest.rallies);

test("browser microsecond rounding preserves selection at fractional frame boundaries", () => {
  const rallies = [{ id: "fractional", game: 1, startSeconds: 2026 / 30, endSeconds: 2370 / 30 }];
  assert.equal(normalizeMediaTime(rallies, 67.533333), rallies[0].startSeconds);
  assert.equal(normalizeMediaTime(rallies, 67.533334), rallies[0].startSeconds);
  assert.equal(normalizeMediaTime(rallies, 67.53), 67.53);
  assert.deepEqual(rallyPlaybackPosition(rallies, 78.9999995), { time: 79, ended: true });
});

test("rally playback skips gaps at half-open endpoints and stops after the last rally", () => {
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 0), { time: 34, ended: false });
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 40), { time: 40, ended: false });
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 48), { time: 72, ended: false });
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 60), { time: 72, ended: false });
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 851), { time: 851, ended: true });
  assert.deepEqual(rallyPlaybackPosition(manifest.rallies, 910), { time: 851, ended: true });
  assert.deepEqual(rallyPlaybackPosition([], 0), { time: 0, ended: true });
  assert.throws(() => rallyPlaybackPosition(manifest.rallies, NaN));
});

test("gameplay boundaries skip source gaps and clamp at both ends", () => {
  assert.equal(sourceAtGameplayTime(timeline, -1), 34);
  assert.equal(sourceAtGameplayTime(timeline, 13.5), 47.5);
  assert.equal(sourceAtGameplayTime(timeline, 14), 72);
  assert.equal(sourceAtGameplayTime(timeline, 20), 78);
  assert.equal(sourceAtGameplayTime(timeline, 10000), 851);
});

test("source gaps snap to the next gameplay boundary", () => {
  assert.equal(gameplayAtSourceTime(timeline, 0), 0);
  assert.equal(gameplayAtSourceTime(timeline, 40), 6);
  assert.equal(gameplayAtSourceTime(timeline, 48), 14);
  assert.equal(gameplayAtSourceTime(timeline, 60), 14);
  assert.equal(gameplayAtSourceTime(timeline, 72), 14);
  assert.equal(gameplayAtSourceTime(timeline, 910), timeline.at(-1)?.gameplayEndSeconds);
});

test("fractional positions round-trip inside every rally", () => {
  for (const rally of timeline) {
    const source = rally.startSeconds + 0.125;
    assert.equal(sourceAtGameplayTime(timeline, gameplayAtSourceTime(timeline, source)), source);
  }
});

test("a single rally and empty timelines have defined endpoints", () => {
  const single = createTimeline([manifest.rallies[0]]);
  assert.equal(sourceAtGameplayTime(single, 14), 48);
  assert.equal(gameplayAtSourceTime(single, 100), 14);
  assert.equal(sourceAtGameplayTime([], 10), 0);
  assert.equal(gameplayAtSourceTime([], 10), 0);
  assert.throws(() => sourceAtGameplayTime(timeline, Number.NaN));
  assert.throws(() => gameplayAtSourceTime(timeline, Number.POSITIVE_INFINITY));
});

test("missing score labels do not remove playable rallies", () => {
  const input = structuredClone(fixture);
  delete input.rallies[0].scoreBefore;
  const parsed = parseRallyManifest(input);
  assert.equal(parsed.rallies.length, 16);
  assert.equal(parsed.rallies[0].scoreBefore, undefined);
});

test("invalid intervals, duplicate IDs, and invalid scores are rejected", () => {
  const mutations = [
    (input: typeof fixture) => { input.rallies[0].startSeconds = -1; },
    (input: typeof fixture) => { input.rallies[0].endSeconds = input.rallies[0].startSeconds; },
    (input: typeof fixture) => { input.rallies[1].startSeconds = 47; },
    (input: typeof fixture) => { input.rallies[1].id = input.rallies[0].id; },
    (input: typeof fixture) => { input.rallies[0].scoreBefore = [0.5, 1]; },
    (input: typeof fixture) => { input.rallies[0].endSeconds = 10000; },
    (input: typeof fixture) => { input.rallies[0].game = 0; },
    (input: typeof fixture) => { input.sourceDurationSeconds = Number.NaN; },
    (input: typeof fixture) => { input.version = 2; },
    (input: typeof fixture) => { input.players = ["Player A"]; },
    (input: typeof fixture) => { input.rallies = []; },
    (input: typeof fixture) => { input.unexpected = true; },
    (input: typeof fixture) => { input.rallies[0].unexpected = true; },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(fixture);
    mutate(input);
    assert.throws(() => parseRallyManifest(input));
  }
});

test("game numbers cannot move backward", () => {
  const input = structuredClone(fixture);
  input.rallies[0].game = 2;
  assert.throws(() => parseRallyManifest(input));
});
