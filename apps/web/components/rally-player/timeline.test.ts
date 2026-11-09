import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch } from "./contract.ts";
import { matchFixture } from "./test-fixtures.ts";
import { formatTime, normalizeMediaTime, playableSegments, rallyIndexAt, rallyPlaybackPosition, rallySeconds } from "./timeline.ts";

const match = parseMatch(matchFixture());
const segments = playableSegments(match.rallies);

test("playable segments flatten every rally's segments in order", () => {
  assert.deepEqual(segments, [[34, 40], [42, 48], [72, 89], [112, 121]]);
  assert.equal(rallySeconds(match.rallies[0]), 12);
});

test("browser microsecond rounding preserves fractional frame boundaries", () => {
  const fractional = [[2026 / 30, 2370 / 30]] as const;
  assert.equal(normalizeMediaTime(fractional, 67.533333), fractional[0][0]);
  assert.equal(normalizeMediaTime(fractional, 67.533334), fractional[0][0]);
  assert.equal(normalizeMediaTime(fractional, 67.53), 67.53);
  assert.deepEqual(rallyPlaybackPosition(fractional, 78.9999995), { time: 79, ended: true });
});

test("playback skips camera cuts inside a rally and gaps between rallies, then stops", () => {
  assert.deepEqual(rallyPlaybackPosition(segments, 0), { time: 34, ended: false });
  assert.deepEqual(rallyPlaybackPosition(segments, 39), { time: 39, ended: false });
  assert.deepEqual(rallyPlaybackPosition(segments, 40), { time: 42, ended: false });
  assert.deepEqual(rallyPlaybackPosition(segments, 48), { time: 72, ended: false });
  assert.deepEqual(rallyPlaybackPosition(segments, 121), { time: 121, ended: true });
  assert.deepEqual(rallyPlaybackPosition(segments, 900), { time: 121, ended: true });
  assert.deepEqual(rallyPlaybackPosition([], 0), { time: 0, ended: true });
  assert.throws(() => rallyPlaybackPosition(segments, Number.NaN));
});

test("a camera cut inside a rally still belongs to that rally", () => {
  assert.equal(rallyIndexAt(match.rallies, 41), 0);
  assert.equal(rallyIndexAt(match.rallies, 48), -1);
  assert.equal(rallyIndexAt(match.rallies, 72), 1);
  assert.equal(rallyIndexAt(match.rallies, 121), 2);
  assert.equal(rallyIndexAt(match.rallies, 10), -1);
});

test("times format like the YouTube player, with hours only for long broadcasts", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(437.5), "7:17");
  assert.equal(formatTime(3599), "59:59");
  assert.equal(formatTime(5120.021), "1:25:20");
});
