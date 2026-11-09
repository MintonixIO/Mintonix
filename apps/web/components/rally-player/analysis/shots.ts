import type { MatchAnalysis, Shot } from "../contract.ts";

/** Badminton court, metres. y runs from the far baseline (0) to the camera baseline. */
export const COURT = {
  width: 6.1,
  length: 13.4,
  netY: 6.7,
  netTop: 1.524,
  netBottom: 0.764,
  postTop: 1.55,
  singlesInset: 0.46,
  shortService: 1.98,   // from the net
  doublesLongService: 0.76, // from the baseline
} as const;

/** The shot being played at `time`: the last one that has started, or -1 before the first. */
export function activeShotIndex(shots: readonly Shot[], time: number) {
  let index = -1;
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].startSeconds <= time + 1e-6) index = i;
    else break;
  }
  return index;
}

/** Shuttle position at `time`, linearly interpolated along the shot's path; null outside its flight. */
export function shuttleAt(shot: Shot, time: number): [number, number, number] | null {
  const path = shot.path;
  if (path.length === 0 || time < path[0][0] || time > path.at(-1)![0]) return null;
  for (let i = 1; i < path.length; i++) {
    const [t1, x1, y1, z1] = path[i];
    if (time <= t1) {
      const [t0, x0, y0, z0] = path[i - 1];
      const f = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
      return [x0 + f * (x1 - x0), y0 + f * (y1 - y0), z0 + f * (z1 - z0)];
    }
  }
  const [, x, y, z] = path[0];
  return [x, y, z];
}

/** Net clearance in metres, or null when the flight doesn't cross the net or crosses
 *  below its top without hitting it (a reconstruction error, not a measurement). */
export function netClearance(shot: Shot) {
  if (shot.netClearance === null) return null;
  return shot.netClearance < 0 && shot.endContact !== "net" ? null : shot.netClearance;
}

export const kmh = (metresPerSecond: number | null) => metresPerSecond === null ? null : Math.round(metresPerSecond * 3.6);

/** Plain-language reason a shot's numbers should be read with care, or null when they are fine. */
export function qualityNote(shot: Shot) {
  if (shot.quality === "guessed") return "One contact position was estimated, so this shot's numbers are approximate.";
  if (shot.quality === "unreliable") {
    const reasons = shot.issues.map((issue) => ({
      camera_cut: "the camera cut away during the flight",
      unrecovered: "the shuttle couldn’t be tracked through the flight",
      high_reprojection_error: "the 3D fit doesn’t match the video closely",
      out_of_bounds: "the reconstructed flight leaves the court area",
      invalid_fit: "the 3D fit failed",
    }[issue])).filter(Boolean);
    return `Not measured reliably${reasons.length ? `: ${[...new Set(reasons)].join("; ")}` : ""}. Left out of player summaries.`;
  }
  return null;
}

export function endLabel(shot: Shot) {
  const labels: Record<string, string> = { ground: "Landed", net: "Hit the net", racket: "Returned" };
  return (shot.endContact && labels[shot.endContact]) || "Unknown";
}

/** A shot by its rally id and 0-based position in that rally. */
export type ShotRef = { rallyId: string; index: number };

/** Seconds before contact that a shot's video cue starts, so the stroke is visible. */
export const SHOT_LEAD_SECONDS = 0.4;

const SHOT_PARAM = /^([a-z0-9][a-z0-9_-]{0,63})\.([1-9]\d{0,3})$/;

/** Read `?shot=<rallyId>.<n>` (n is 1-based); null when it is missing or malformed. */
export function parseShotParam(value: string | null): ShotRef | null {
  const found = value ? SHOT_PARAM.exec(value) : null;
  return found ? { rallyId: found[1], index: Number(found[2]) - 1 } : null;
}

export const formatShotParam = ({ rallyId, index }: ShotRef) => `${rallyId}.${index + 1}`;

/** The shot a ref points to, or null when the analysis doesn't have it. */
export function resolveShot(analysis: MatchAnalysis | undefined, ref: ShotRef | null): { ref: ShotRef; shot: Shot } | null {
  const shot = ref ? analysis?.rallies[ref.rallyId]?.shots[ref.index] : undefined;
  return ref && shot ? { ref, shot } : null;
}

/** Where the video is cued for a shot: just before contact, but never before its rally starts. */
export const shotCueTime = (rallyStartSeconds: number, shot: Shot) => Math.max(rallyStartSeconds, shot.startSeconds - SHOT_LEAD_SECONDS);
