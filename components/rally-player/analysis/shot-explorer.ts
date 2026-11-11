import type { Match, MatchAnalysis, Rally, Shot, ShotTypeName } from "../contract.ts";
import { shotTypeView } from "./shot-types.ts";
import { COURT, type ShotRef } from "./shots.ts";

export const DEPTHS = ["front", "mid", "rear"] as const;
export const SIDES = ["left", "right"] as const;
/** Where the hitter stood, from their own view facing the net. */
export type HitZone = `${(typeof DEPTHS)[number]}-${(typeof SIDES)[number]}`;
export const HIT_ZONES = DEPTHS.flatMap((depth) => SIDES.map((side) => `${depth}-${side}` as HitZone));

export const ZONE_LABELS: Record<HitZone, string> = {
  "front-left": "front left", "front-right": "front right",
  "mid-left": "mid-court left", "mid-right": "mid-court right",
  "rear-left": "rear left", "rear-right": "rear right",
};

/** The hitter's half split into equal thirds from the net. */
const THIRD = (COURT.length - COURT.netY) / 3;

/** The contact point seen like `placement`: far-end shots rotated 180° so the hitter is at the camera end. */
export function contactSeenFromHitter(shot: Shot): [number, number] {
  const [x, y] = shot.contact;
  return shot.hitterEnd === "far" ? [COURT.width - x, COURT.length - y] : [x, y];
}

/** The contact point's zone, from the hitter's own view facing the net. */
export function hitZone(shot: Shot): HitZone {
  const [cx, cy] = contactSeenFromHitter(shot);
  const fromNet = cy - COURT.netY;
  const depth = fromNet < THIRD ? "front" : fromNet < 2 * THIRD ? "mid" : "rear";
  // At the camera end the hitter faces away from the camera, so their right is the camera's right (high x).
  return `${depth}-${cx > COURT.width / 2 ? "right" : "left"}`;
}

export type ShotOutcome = "winner" | "error" | "returned" | "unknown";

/** The rally's last racket shot won or lost the point; every earlier shot was returned. */
export function shotOutcome(shots: readonly Shot[], index: number, winner: Rally["winner"]): ShotOutcome {
  const last = shots.findLastIndex((shot) => shot.hitter !== null);
  if (index !== last) return "returned";
  if (!winner) return "unknown";
  return shots[index].hitter === winner ? "winner" : "error";
}

export type ExplorerFilter = { player: string; type: ShotTypeName | "all"; zone: HitZone | "all" };

export type ExploredShot = {
  ref: ShotRef;
  rallyIndex: number;
  rally: Rally;
  shot: Shot;
  zone: HitZone;
  outcome: ShotOutcome;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One player's shots matching a stroke type and hit zone, with what became of each.
 * Unreliable flights and shots whose type the model isn't sure of are counted, not plotted.
 * Zone counts ignore the zone filter and type counts ignore the type filter, so the controls show what each choice holds.
 */
export function exploreShots(match: Match, analysis: MatchAnalysis, filter: ExplorerFilter) {
  const candidates: (ExploredShot & { type: ShotTypeName | null })[] = [];
  let unreliable = 0;
  let uncertainType = 0;
  match.rallies.forEach((rally, rallyIndex) => {
    const shots = analysis.rallies[rally.id]?.shots ?? [];
    shots.forEach((shot, index) => {
      if (shot.hitter !== filter.player) return;
      const view = shotTypeView(shot);
      const type = view?.confident ? view.name : null;
      const zone = hitZone(shot);
      const inZone = filter.zone === "all" || zone === filter.zone;
      if (shot.quality === "unreliable") {
        if (inZone && (filter.type === "all" || view?.name === filter.type)) unreliable++;
        return;
      }
      if (filter.type !== "all" && type !== filter.type && view?.name === filter.type && inZone) uncertainType++;
      candidates.push({ ref: { rallyId: rally.id, index }, rallyIndex, rally, shot, zone, type, outcome: shotOutcome(shots, index, rally.winner) });
    });
  });
  const typeMatches = (c: (typeof candidates)[number]) => filter.type === "all" || c.type === filter.type;
  const zoneMatches = (c: (typeof candidates)[number]) => filter.zone === "all" || c.zone === filter.zone;
  const zoneCounts = Object.fromEntries(HIT_ZONES.map((zone) => [zone, 0])) as Record<HitZone, number>;
  const typeCounts: Partial<Record<ShotTypeName, number>> = {};
  for (const c of candidates) {
    if (typeMatches(c)) zoneCounts[c.zone]++;
    if (zoneMatches(c) && c.type) typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
  }
  const shots: ExploredShot[] = candidates.filter((c) => typeMatches(c) && zoneMatches(c));
  const count = (outcome: ShotOutcome) => shots.filter((s) => s.outcome === outcome).length;
  const speed = median(shots.flatMap((s) => (s.shot.speed === null ? [] : [s.shot.speed])));
  return {
    shots,
    tally: { shots: shots.length, winners: count("winner"), errors: count("error"), returned: count("returned"), medianKmh: speed === null ? null : Math.round(speed * 3.6) },
    leftOut: { unreliable, uncertainType },
    zoneCounts,
    typeCounts,
  };
}
