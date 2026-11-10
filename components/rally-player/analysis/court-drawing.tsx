import { useId } from "react";
import type { Shot } from "../contract";
import { COURT, kmh, shuttleAt } from "./shots";
import styles from "./analysis.module.css";

/**
 * Two orthographic views of one rally that share the court-length axis:
 * from above (top) and from the side (bottom), far end on the left, camera
 * end on the right. A cyan guide joins the shuttle's position in both views.
 */

const S = 60;                     // drawing units per metre
const END_MARGIN = 0.9;           // metres beyond each baseline
const SIDE_MARGIN = 0.35;
const Z_MAX = 5;                  // the side view is cut off above 5 m
const WIDTH = (COURT.length + 2 * END_MARGIN) * S;
const PLAN_TOP = 26;
const PLAN_HEIGHT = (COURT.width + 2 * SIDE_MARGIN) * S;
const SIDE_TOP = PLAN_TOP + PLAN_HEIGHT + 44;
const SIDE_HEIGHT = Z_MAX * S;
const HEIGHT = SIDE_TOP + SIDE_HEIGHT + 30;

const sx = (y: number) => (y + END_MARGIN) * S;
// Seen from above with the camera end on the right, the camera's left (x = 0) is at the bottom.
const px = (x: number) => PLAN_TOP + (COURT.width + SIDE_MARGIN - x) * S;
const sz = (z: number) => SIDE_TOP + (Z_MAX - z) * S;

export type PlayerTone = "a" | "b" | "none";

function CourtLines() {
  const { width: w, length: l, netY, singlesInset: s, shortService, doublesLongService: d } = COURT;
  const across = (y: number) => <line x1={sx(y)} x2={sx(y)} y1={px(0)} y2={px(w)} />;
  const along = (x: number, y1 = 0, y2: number = l) => <line x1={sx(y1)} x2={sx(y2)} y1={px(x)} y2={px(x)} />;
  const marks: number[] = [0, d, netY - shortService, netY, netY + shortService, l - d, l];
  return (
    <>
      <rect className={styles.courtSurface} x={sx(0)} y={px(w)} width={l * S} height={w * S} />
      <g className={styles.courtLines}>
        {along(0)}{along(w)}{along(s)}{along(w - s)}
        {along(w / 2, 0, netY - shortService)}{along(w / 2, netY + shortService, l)}
        {across(0)}{across(l)}{across(d)}{across(l - d)}{across(netY - shortService)}{across(netY + shortService)}
      </g>
      <line className={styles.net} x1={sx(netY)} x2={sx(netY)} y1={px(-0.25)} y2={px(w + 0.25)} />
      {/* Projection guides: each court line continues down to its tick in the side view. */}
      <g className={styles.guides}>
        {[0, netY, l].map((y) => <line key={y} x1={sx(y)} x2={sx(y)} y1={px(-0.25)} y2={sz(0)} />)}
      </g>
      <line className={styles.ground} x1={sx(-0.6)} x2={sx(l + 0.6)} y1={sz(0)} y2={sz(0)} />
      <g className={styles.courtLines}>
        {marks.map((y) => <line key={y} x1={sx(y)} x2={sx(y)} y1={sz(0)} y2={sz(0) + 7} />)}
      </g>
      <g className={styles.heightGrid}>
        {[1, 2, 3, 4].map((z) => <line key={z} x1={sx(-0.6)} x2={sx(l + 0.6)} y1={sz(z)} y2={sz(z)} />)}
      </g>
      <g className={styles.axisText}>
        {[1, 2, 3, 4].map((z) => <text key={z} x={sx(-0.6)} y={sz(z) - 6}>{z} m</text>)}
      </g>
      <line className={styles.net} x1={sx(netY)} x2={sx(netY)} y1={sz(0)} y2={sz(COURT.postTop)} />
      <rect className={styles.netMesh} x={sx(netY) - 3} y={sz(COURT.netTop)} width={6} height={(COURT.netTop - COURT.netBottom) * S} />
      <text className={styles.axisText} x={sx(netY) + 9} y={sz(COURT.netTop) + 4}>1.52 m</text>
      <g className={styles.viewText}>
        <text x={sx(-0.6)} y={PLAN_TOP - 10}>From above</text>
        <text x={sx(-0.6)} y={SIDE_TOP - 14}>From the side</text>
        <text x={sx(0)} y={HEIGHT - 6}>Far end</text>
        <text x={sx(l)} y={HEIGHT - 6} textAnchor="end">Camera end</text>
      </g>
    </>
  );
}

function points(shot: Shot, view: "plan" | "side") {
  return shot.path.map(([, x, y, z]) => `${sx(y).toFixed(1)},${(view === "plan" ? px(x) : sz(z)).toFixed(1)}`).join(" ");
}

function ShotMarks({ shot, tone, active, clip, onSelect }: { shot: Shot; tone: PlayerTone; active: boolean; clip: string; onSelect: () => void }) {
  if (shot.path.length === 0) return null;
  const [, ex, ey, ez] = shot.path.at(-1)!;
  const [, cx, cy, cz] = shot.path[0];
  return (
    <g className={styles.shot} data-tone={tone} data-active={active || undefined} data-quality={shot.quality} onClick={onSelect}>
      <polyline points={points(shot, "plan")} />
      <polyline points={points(shot, "side")} clipPath={clip} />
      <circle className={styles.contactDot} cx={sx(cy)} cy={px(cx)} r={active ? 5 : 3.5} />
      <circle className={styles.contactDot} cx={sx(cy)} cy={sz(cz)} r={active ? 5 : 3.5} />
      {shot.endContact === "ground"
        ? <path className={styles.landing} d={`M${sx(ey) - 6},${px(ex) - 6}l12,12m0,-12l-12,12`} />
        : <circle className={styles.endRing} cx={sx(ey)} cy={px(ex)} r={active ? 5 : 3.5} />}
      {shot.endContact !== "ground" && <circle className={styles.endRing} cx={sx(ey)} cy={sz(ez)} r={active ? 5 : 3.5} />}
    </g>
  );
}

export function CourtDrawing({ shots, activeIndex, time, tone, onSelect, describe, only = false }: {
  shots: readonly Shot[];
  /** Draw only the active shot (shot zoom). */
  only?: boolean;
  activeIndex: number;
  time: number;
  tone: (shot: Shot) => PlayerTone;
  onSelect: (index: number) => void;
  describe: (shot: Shot) => string;
}) {
  const active = shots[activeIndex];
  const shuttle = active ? shuttleAt(active, time) : null;
  const label = only && active
    ? `Court diagram of shot ${activeIndex + 1}, from above and from the side: ${describe(active)}${kmh(active.speed) ? `, ${kmh(active.speed)} km/h` : ""}.`
    : active
    ? `Court diagram of this rally’s ${shots.length} shots, from above and from the side. Shot ${activeIndex + 1}: ${describe(active)}${kmh(active.speed) ? `, ${kmh(active.speed)} km/h` : ""}.`
    : `Court diagram of this rally’s ${shots.length} shots, from above and from the side.`;
  // Draw the active shot last so it sits on top.
  const clipId = useId();
  const clip = `url(#${clipId})`;
  const order = only
    ? (active ? [activeIndex] : [])
    : shots.map((_, index) => index).sort((a, b) => Number(a === activeIndex) - Number(b === activeIndex));
  return (
    <svg className={styles.drawing} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}><rect x={0} y={SIDE_TOP - 2} width={WIDTH} height={SIDE_HEIGHT + 2} /></clipPath>
      </defs>
      <CourtLines />
      {order.map((index) => (
        <ShotMarks key={index} shot={shots[index]} tone={tone(shots[index])} active={index === activeIndex} clip={clip} onSelect={() => onSelect(index)} />
      ))}
      {shuttle && (
        <g className={styles.shuttle} aria-hidden="true">
          <line x1={sx(shuttle[1])} x2={sx(shuttle[1])} y1={px(shuttle[0])} y2={sz(Math.min(shuttle[2], Z_MAX))} />
          <circle cx={sx(shuttle[1])} cy={px(shuttle[0])} r={6} />
          {shuttle[2] <= Z_MAX && <circle cx={sx(shuttle[1])} cy={sz(shuttle[2])} r={6} />}
        </g>
      )}
    </svg>
  );
}

/** A small view from above of where one player's shots ended, seen from their end. */
export function PlacementMap({ placements, tone, label }: {
  placements: readonly (readonly [number, number, number, string | null])[];
  tone: PlayerTone;
  label: string;
}) {
  const { width: w, length: l, netY, singlesInset: s, shortService, doublesLongService: d } = COURT;
  const m = 0.5;
  const k = 20;
  const x = (y: number) => (y + m) * k;
  const y = (cx: number) => (w + m - cx) * k;
  return (
    <svg className={styles.placementMap} viewBox={`0 0 ${(l + 2 * m) * k} ${(w + 2 * m) * k}`} role="img" aria-label={label}>
      <rect className={styles.courtSurface} x={x(0)} y={y(w)} width={l * k} height={w * k} />
      <g className={styles.courtLines}>
        {[0, s, w - s, w].map((cx) => <line key={cx} x1={x(0)} x2={x(l)} y1={y(cx)} y2={y(cx)} />)}
        {[0, d, netY - shortService, netY + shortService, l - d, l].map((cy) => <line key={cy} x1={x(cy)} x2={x(cy)} y1={y(0)} y2={y(w)} />)}
      </g>
      <line className={styles.net} x1={x(netY)} x2={x(netY)} y1={y(-0.2)} y2={y(w + 0.2)} />
      <g className={styles.placements} data-tone={tone}>
        {placements.map(([cx, cy, , end], index) => (
          <circle key={index} cx={x(cy)} cy={y(cx)} r={end === "ground" ? 1.7 : 1.3} data-end={end ?? undefined} />
        ))}
      </g>
    </svg>
  );
}
