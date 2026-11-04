import assert from "node:assert/strict";
import test from "node:test";
import { createTimeline, formatTime, gameplayAtSourceTime, normalizeMediaTime, parseRallyManifest, rallyPlaybackPosition, sourceAtGameplayTime } from "./timeline.ts";

// Synthetic data stays local to the tests; contracts contains the canonical schema.
const fixture: Record<string, unknown> & { rallies: Record<string, unknown>[] } = {
  version: 2,
  matchId: "illustrative-match",
  title: "Player A vs Player B",
  players: ["Player A", "Player B"],
  source: { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: 910 },
  rallies: [
    { id: "rally-01", game: 1, startSeconds: 34, endSeconds: 48, scoreBefore: [0, 0] },
    { id: "rally-02", game: 1, startSeconds: 72, endSeconds: 89, scoreBefore: [1, 0] },
    { id: "rally-03", game: 1, startSeconds: 112, endSeconds: 121, scoreBefore: [1, 1] },
    { id: "rally-04", game: 1, startSeconds: 154, endSeconds: 178, scoreBefore: [2, 1] },
    { id: "rally-05", game: 1, startSeconds: 209, endSeconds: 225, scoreBefore: [2, 2] },
    { id: "rally-06", game: 1, startSeconds: 260, endSeconds: 272, scoreBefore: [3, 2] },
    { id: "rally-07", game: 1, startSeconds: 305, endSeconds: 325, scoreBefore: [4, 2] },
    { id: "rally-08", game: 1, startSeconds: 357, endSeconds: 368, scoreBefore: [4, 3] },
    { id: "rally-09", game: 1, startSeconds: 403, endSeconds: 426, scoreBefore: [5, 3] },
    { id: "rally-10", game: 1, startSeconds: 466, endSeconds: 481, scoreBefore: [5, 4] },
    { id: "rally-11", game: 1, startSeconds: 519, endSeconds: 548, scoreBefore: [6, 4] },
    { id: "rally-12", game: 1, startSeconds: 580, endSeconds: 596, scoreBefore: [7, 4] },
    { id: "rally-13", game: 1, startSeconds: 628, endSeconds: 642, scoreBefore: [7, 5] },
    { id: "rally-14", game: 1, startSeconds: 688, endSeconds: 713, scoreBefore: [8, 5] },
    { id: "rally-15", game: 1, startSeconds: 755, endSeconds: 775, scoreBefore: [8, 6] },
    { id: "rally-16", game: 1, startSeconds: 831, endSeconds: 851, scoreBefore: [9, 6] },
  ],
};
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
    (input: typeof fixture) => { input.source = { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: Number.NaN }; },
    (input: typeof fixture) => { input.source = { provider: "vimeo", videoId: "AAAAAAAAAAA", durationSeconds: 910 }; },
    (input: typeof fixture) => { input.source = { provider: "youtube", videoId: "https://youtu.be/AAAAAAAAAAA", durationSeconds: 910 }; },
    (input: typeof fixture) => { input.source = { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: 910, url: "x" }; },
    (input: typeof fixture) => { delete input.source; },
    (input: typeof fixture) => { input.sourceDurationSeconds = 910; delete input.source; },
    (input: typeof fixture) => { input.version = 1; },
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

test("times format like the YouTube player, with hours only for long broadcasts", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(437.5), "7:17");
  assert.equal(formatTime(3599), "59:59");
  assert.equal(formatTime(5120.021), "1:25:20");
});
