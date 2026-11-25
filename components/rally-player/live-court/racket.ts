import type { Vec3 } from "../analysis/replay.ts";
import { frameAt, type DecodedRun } from "./motion.ts";

/**
 * The racket on the live court is drawn, not tracked: the Engine exports no hand orientation.
 * It hangs from the racket hand's wrist along the forearm and, around the player's own hit,
 * turns towards the point the shuttle was struck so racket and shuttle meet.
 */

export type Hand = "left" | "right";

/** Grip to tip: shaft and handle 0.39 m plus a 0.29 m head. */
export const RACKET_LENGTH = 0.68;
/** How long before and after a hit the racket turns towards the contact point. */
export const REACH_SECONDS = 0.15;

// H36M joints.
const ELBOW: Record<Hand, number> = { left: 12, right: 15 };
const WRIST: Record<Hand, number> = { left: 13, right: 16 };
const VALUES_PER_FRAME = 51;
const CONTACT_FRAMES = 3;

function jointAt(run: DecodedRun, frame: number, joint: number): Vec3 {
  const base = frame * VALUES_PER_FRAME + joint * 3;
  return [run.joints[base], run.joints[base + 1], run.joints[base + 2]];
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Path length of a wrist over frames [from, to] of a run. */
function wristTravel(run: DecodedRun, joint: number, from: number, to: number) {
  let total = 0;
  for (let f = Math.max(1, from); f <= Math.min(run.frames - 1, to); f++) total += distance(jointAt(run, f, joint), jointAt(run, f - 1, joint));
  return total;
}

/**
 * Which hand holds the racket in this rally: the wrist that moves more around the player's own
 * contacts (times in source seconds), or over the whole rally when no contact falls in a run.
 */
export function racketHand(runs: readonly DecodedRun[] | undefined, fps: number, contacts: readonly number[]): Hand | null {
  if (!runs?.length) return null;
  const near = { left: 0, right: 0 };
  let counted = false;
  for (const time of contacts) {
    const frame = frameAt(time, fps);
    const run = runs.find((candidate) => frame >= candidate.startFrame && frame < candidate.startFrame + candidate.frames);
    if (!run) continue;
    const at = frame - run.startFrame;
    for (const hand of ["left", "right"] as const) near[hand] += wristTravel(run, WRIST[hand], at - CONTACT_FRAMES, at + CONTACT_FRAMES);
    counted = true;
  }
  if (counted && near.left !== near.right) return near.right > near.left ? "right" : "left";
  const whole = { left: 0, right: 0 };
  for (const run of runs) for (const hand of ["left", "right"] as const) whole[hand] += wristTravel(run, WRIST[hand], 1, run.frames - 1);
  return whole.right >= whole.left ? "right" : "left";
}

function normalise(v: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return length > 1e-6 ? [v[0] / length, v[1] / length, v[2] / length] : fallback;
}

/** The racket's grip and tip (court metres) for one pose, reaching towards a contact near `time`. */
export function racketPose(pose: Float32Array, hand: Hand, time: number, contact: { time: number; point: Vec3 } | null): { grip: Vec3; tip: Vec3 } {
  const at = (joint: number): Vec3 => [pose[joint * 3], pose[joint * 3 + 1], pose[joint * 3 + 2]];
  const grip = at(WRIST[hand]);
  const elbow = at(ELBOW[hand]);
  let direction = normalise([grip[0] - elbow[0], grip[1] - elbow[1], grip[2] - elbow[2]], [0, 0, 1]);
  const gap = contact ? Math.abs(time - contact.time) : Infinity;
  if (contact && gap <= REACH_SECONDS) {
    const reach = normalise([contact.point[0] - grip[0], contact.point[1] - grip[1], contact.point[2] - grip[2]], direction);
    const weight = 1 - gap / REACH_SECONDS;
    direction = normalise([0, 1, 2].map((k) => direction[k] * (1 - weight) + reach[k] * weight) as Vec3, reach);
  }
  return { grip, tip: [grip[0] + direction[0] * RACKET_LENGTH, grip[1] + direction[1] * RACKET_LENGTH, grip[2] + direction[2] * RACKET_LENGTH] };
}
