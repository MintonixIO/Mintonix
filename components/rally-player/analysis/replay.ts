import type { Shot } from "../contract.ts";
import { COURT } from "./shots.ts";

/**
 * Timing and camera maths for the 3D shot replay, kept free of three.js so it can be tested.
 * Scene coordinates are y-up and centred on the net: x across, y up, z along the court with
 * the far baseline at −6.7 and the camera baseline at +6.7.
 */

export type Vec3 = [number, number, number];
export type CameraPreset = "broadcast" | "side" | "top" | "hitter";
export const CAMERA_PRESETS: readonly CameraPreset[] = ["broadcast", "side", "top", "hitter"];
export const REPLAY_HOLD_SECONDS = 0.6;
export const REPLAY_SPEEDS = [0.25, 0.5, 1] as const;

const HALF_WIDTH = COURT.width / 2;
const HALF_LENGTH = COURT.length / 2;

/** Court metres (x across, y from the far baseline, z up) to scene coordinates. */
export const toScene = ([x, y, z]: readonly number[]): Vec3 => [x - HALF_WIDTH, z, y - COURT.netY];

/** Source-video seconds of the first and last path samples. */
export function flightBounds(shot: Shot) {
  if (shot.path.length === 0) return { start: shot.startSeconds, end: shot.startSeconds };
  return { start: shot.path[0][0], end: Math.max(shot.path[0][0], shot.path.at(-1)![0]) };
}

export function replayDuration(shot: Shot) {
  const { start, end } = flightBounds(shot);
  return end - start + REPLAY_HOLD_SECONDS;
}

/** Source time shown `elapsedSeconds` into a looping replay at `speed`; held at the landing between loops. */
export function replayTime(shot: Shot, elapsedSeconds: number, speed: number) {
  const { start, end } = flightBounds(shot);
  const loop = (Math.max(0, elapsedSeconds) * speed) % replayDuration(shot);
  return start + Math.min(loop, end - start);
}

/** How many path samples the trail has passed at `time`. */
export function trailIndex(shot: Shot, time: number) {
  let count = 0;
  while (count < shot.path.length && shot.path[count][0] <= time + 1e-9) count++;
  return count;
}

const clampToCourt = ([x, y, z]: Vec3): Vec3 => [
  Math.min(HALF_WIDTH, Math.max(-HALF_WIDTH, x)),
  Math.max(0, y),
  Math.min(HALF_LENGTH, Math.max(-HALF_LENGTH, z)),
];

export function cameraPreset(name: CameraPreset, shot: Shot): { position: Vec3; target: Vec3 } {
  switch (name) {
    case "broadcast": return { position: [0, 7.5, HALF_LENGTH + 9], target: [0, 0.8, 0] };
    case "side": return { position: [-11, 2.2, 0], target: [0, 1.5, 0] };
    case "top": return { position: [0, 22, 0.01], target: [0, 0, 0] };
    case "hitter": {
      const contact = toScene(shot.contact);
      const end = toScene(shot.end);
      let dx = end[0] - contact[0];
      let dz = end[2] - contact[2];
      const length = Math.hypot(dx, dz);
      if (length < 0.1) {
        // No horizontal travel to aim along: look down the court toward the opponent.
        dx = 0;
        dz = shot.hitterEnd === "far" ? 1 : -1;
      } else {
        dx /= length;
        dz /= length;
      }
      return {
        position: [contact[0] - dx * 3.5, Math.max(contact[1], 1) + 1.8, contact[2] - dz * 3.5],
        target: clampToCourt([end[0], 0.5, end[2]]),
      };
    }
  }
}

export type ReplayKeyAction = "toggle" | "previous" | "next" | "close";

/**
 * What a key does in the replay. A focused button keeps Space (it activates the button) and
 * the scrub slider keeps the arrows; Escape always returns to the video.
 */
export function replayKeyAction(
  key: string,
  target: "button" | "input" | "other",
  { index, count, hasPath }: { index: number; count: number; hasPath: boolean },
): ReplayKeyAction | null {
  if (key === "Escape") return "close";
  if (key === " ") return target === "other" && hasPath ? "toggle" : null;
  if (target === "input") return null;
  if (key === "ArrowLeft") return index > 0 ? "previous" : null;
  if (key === "ArrowRight") return index < count - 1 ? "next" : null;
  return null;
}
