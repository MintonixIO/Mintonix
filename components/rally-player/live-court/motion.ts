import type { PoseRun, RallyMotion, Shot } from "../contract.ts";
import { shotTypeView } from "../analysis/shot-types.ts";
import { kmh } from "../analysis/shots.ts";

/**
 * The live court's data, decoded once per rally file: each player's skeleton runs in
 * metres, and the running distance the Engine measured, spread along the rally so it
 * can grow with playback. Pure functions; the scene draws what these return.
 */

/** H36M joint pairs drawn as bones: legs, spine, neck and head, arms. */
export const BONES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 9], [9, 10],
  [8, 11], [11, 12], [12, 13], [8, 14], [14, 15], [15, 16],
];
export const HEAD = 10;
const VALUES_PER_FRAME = 17 * 3;

/** How long a hit's tag stays up, unless the next hit comes first. */
export const TAG_SECONDS = 1.2;

export type DecodedRun = {
  startFrame: number;
  frames: number;
  /** frames × 17 joints × (x, y, z), court metres. */
  joints: Float32Array;
  /** Horizontal hip travel up to each frame within the run, metres. */
  travelled: Float32Array;
};

export type Skeletons = {
  fps: number;
  players: Record<string, DecodedRun[]>;
  distance: Record<string, number>;
};

export function decodeRun(run: PoseRun): DecodedRun {
  const joints = new Float32Array(run.frames * VALUES_PER_FRAME);
  const travelled = new Float32Array(run.frames);
  const root = [0, 0, 0];
  const relative = new Array<number>(48).fill(0);
  for (let f = 0; f < run.frames; f++) {
    for (let k = 0; k < 3; k++) root[k] += run.root[f * 3 + k];
    for (let k = 0; k < 48; k++) relative[k] += run.joints[f * 48 + k];
    const base = f * VALUES_PER_FRAME;
    for (let k = 0; k < 3; k++) joints[base + k] = root[k] / 100;
    for (let k = 0; k < 48; k++) joints[base + 3 + k] = (relative[k] + root[k % 3]) / 100;
    if (f > 0) {
      const dx = joints[base] - joints[base - VALUES_PER_FRAME];
      const dy = joints[base + 1] - joints[base - VALUES_PER_FRAME + 1];
      travelled[f] = travelled[f - 1] + Math.hypot(dx, dy);
    }
  }
  return { startFrame: run.startFrame, frames: run.frames, joints, travelled };
}

export function decodeMotion(motion: RallyMotion): Skeletons {
  const players = Object.fromEntries(Object.entries(motion.poses).map(([player, runs]) => [player, runs.map(decodeRun)]));
  return { fps: motion.fps, players, distance: motion.distance };
}

/** The source-video frame shown at `time` seconds. */
export const frameAt = (time: number, fps: number) => Math.floor(time * fps + 1e-6);

/** A player's 17 joints at `frame` (51 values, metres), or null in a gap: never frozen or joined across. */
export function poseAt(runs: readonly DecodedRun[] | undefined, frame: number): Float32Array | null {
  const run = runs?.find((candidate) => frame >= candidate.startFrame && frame < candidate.startFrame + candidate.frames);
  if (!run) return null;
  const offset = (frame - run.startFrame) * VALUES_PER_FRAME;
  return run.joints.subarray(offset, offset + VALUES_PER_FRAME);
}

/**
 * Metres a player has covered by `frame`: the Engine's distance (smoothed ankle track)
 * spread along the rally in proportion to the hip's travel, so it grows with playback and
 * reaches exactly the Engine's figure at the end. Null when the player has no distance.
 */
export function distanceSoFar(skeletons: Skeletons, player: string, frame: number): number | null {
  const total = skeletons.distance[player];
  if (total === undefined) return null;
  const runs = skeletons.players[player] ?? [];
  let covered = 0;
  let travel = 0;
  for (const run of runs) {
    const runTravel = run.travelled[run.frames - 1];
    travel += runTravel;
    if (frame >= run.startFrame + run.frames - 1) covered += runTravel;
    else if (frame >= run.startFrame) covered += run.travelled[frame - run.startFrame];
  }
  if (travel === 0) {
    const last = runs.at(-1);
    return last && frame >= last.startFrame + last.frames - 1 ? total : 0;
  }
  return total * (covered / travel);
}

/** Index of the racket hit whose tag shows at `time`, or null. */
export function tagAt(shots: readonly Shot[], time: number): number | null {
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];
    if (shot.startSeconds > time + 1e-6) continue;
    const next = shots[i + 1]?.startSeconds ?? Infinity;
    const visible = time < Math.min(shot.startSeconds + TAG_SECONDS, next);
    return visible && shot.startContact === "racket" && shot.hitter !== null ? i : null;
  }
  return null;
}

/** "SMASH · 312 km/h"; "LIFT?" for an unsure pick; no number for an unreliable shot; null without a stroke type. */
export function tagText(shot: Shot): string | null {
  const type = shotTypeView(shot);
  if (!type || type.name === null) return null;
  const name = `${type.short.toUpperCase()}${type.confident ? "" : "?"}`;
  const speed = shot.quality === "unreliable" ? null : kmh(shot.speed);
  return speed === null ? name : `${name} · ${speed} km/h`;
}
