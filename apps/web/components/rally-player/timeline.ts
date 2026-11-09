import type { Rally } from "./contract.ts";

/** A watchable [start, end) interval in source-video seconds. Source timestamps are canonical. */
export type Segment = readonly [number, number];

/** Every watchable segment of the match, in order. Playback skips everything between them. */
export function playableSegments(rallies: readonly Rally[]): Segment[] {
  return rallies.flatMap((rally) => rally.segments);
}

export const rallyStart = (rally: Rally) => rally.segments[0][0];
export const rallyEnd = (rally: Rally) => rally.segments.at(-1)![1];

/** Watchable seconds of a rally (camera cuts inside it excluded). */
export function rallySeconds(rally: Rally) {
  return rally.segments.reduce((total, [start, end]) => total + end - start, 0);
}

/** Index of the rally whose span (first start to last end) contains `time`, or -1 between rallies. */
export function rallyIndexAt(rallies: readonly Rally[], time: number) {
  return rallies.findIndex((rally, index) => time >= rallyStart(rally)
    && (time < rallyEnd(rally) || (index === rallies.length - 1 && time === rallyEnd(rally))));
}

function requirePosition(position: number) {
  if (!Number.isFinite(position)) throw new Error("Timeline position must be finite");
}

/** While playing, move through gaps between segments and stop at the last segment end. */
export function rallyPlaybackPosition(segments: readonly Segment[], position: number) {
  position = normalizeMediaTime(segments, position);
  for (const [start, end] of segments) {
    if (position < start) return { time: start, ended: false };
    if (position < end) return { time: position, ended: false };
  }
  return { time: segments.at(-1)?.[1] ?? 0, ended: true };
}

/** Browsers round currentTime to microseconds; restore exact frame boundaries. */
export function normalizeMediaTime(segments: readonly Segment[], position: number) {
  requirePosition(position);
  for (const [start, end] of segments) {
    if (Math.abs(position - start) <= 0.000001) return start;
    if (Math.abs(position - end) <= 0.000001) return end;
  }
  return position;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
