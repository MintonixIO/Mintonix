import styles from "./feature-showcase.module.css";

export type FeatureKind = "search" | "flight" | "patterns" | "highlights" | "comparison" | "opponent" | "serve" | "collections" | "practice" | "sharing";

const iconPaths: Record<FeatureKind, string> = {
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  flight: "m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10",
  patterns: "m7 16 4-9m3 1 4 8M8 19h8M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  highlights: "m8 4 13 8-13 8V4Z",
  comparison: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  opponent: "M12 2v4m0 12v4M2 12h4m12 0h4M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  serve: "M3 7h18m-5-5 5 5-5 5M21 17H3m5-5-5 5 5 5",
  collections: "M3 6a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
  practice: "M21 12a9 9 0 1 1-9-9m7 0-7 9m0-5a5 5 0 1 0 5 5",
  sharing: "M12 16V2m-5 5 5-5 5 5M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
};

export function FeatureIcon({ kind }: { kind: FeatureKind }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[kind]} /></svg>;
}

/*
 * A real clear from the dl1 demo match (analysis rally g3-2-0, shot 10, Viktor Axelsen), seen from
 * the side: [metres along the court, metres above the floor] for each reconstructed point.
 */
const CLEAR = [[11.72, 2.89], [9.4, 4.1], [7.77, 4.87], [6.54, 5.37], [5.59, 5.67], [4.8, 5.82], [4.14, 5.86], [3.57, 5.8], [3.07, 5.66], [2.62, 5.44], [2.23, 5.16], [1.88, 4.81], [1.56, 4.41], [1.28, 3.96], [1.04, 3.47], [0.82, 2.95]] as const;
const COURT_LENGTH = 13.4;
const NET_HEIGHT = 1.55;
const SCALE = 35.8;
const FLOOR = 262;
const x = (along: number) => 60 + (COURT_LENGTH - along) * SCALE;
const y = (height: number) => FLOOR - height * SCALE;
const points = CLEAR.map(([along, height]) => [x(along), y(height)] as const);
// A smooth curve through the measured points: each sample is a control point, midpoints are on the curve.
const clearPath = points.reduce((d, [px, py], i) => {
  if (i === 0) return `M${px} ${py}`;
  const [nx, ny] = points[i + 1] ?? [px, py];
  return `${d}Q${px} ${py} ${(px + nx) / 2} ${(py + ny) / 2}`;
}, "");
const apexIndex = CLEAR.reduce((best, point, i) => point[1] > CLEAR[best][1] ? i : best, 0);
const [apexX, apexY] = points[apexIndex];
const apexHeight = CLEAR[apexIndex][1];
const [startX, startY] = points[0];
const [endX, endY] = points.at(-1)!;

/** One measured clear from the side: how high it went is read straight off the metre lines. */
export function FlightIllustration() {
  return <figure className={styles.flightVisual} data-feature-motion="flight">
    <svg viewBox="0 0 600 300" fill="none" aria-hidden="true">
      <g className={styles.heightLines}>
        {[2, 4, 6].map((metres) => <g key={metres}>
          <line x1="40" x2="560" y1={y(metres)} y2={y(metres)} />
          <text x="566" y={y(metres) + 4}>{metres} m</text>
        </g>)}
      </g>
      <line className={styles.floor} x1="40" x2="560" y1={FLOOR} y2={FLOOR} />
      <path className={styles.courtTicks} d={[0, 0.76, 4.72, 8.68, 12.64, 13.4].map((along) => `M${x(along)} ${FLOOR}v6`).join("")} />
      <rect className={styles.netMesh} x={x(6.7) - 1.5} y={y(NET_HEIGHT)} width="3" height={NET_HEIGHT * SCALE * .5} />
      <line className={styles.netPost} x1={x(6.7)} x2={x(6.7)} y1={FLOOR} y2={y(NET_HEIGHT)} />
      <text className={styles.netLabel} x={x(6.7) + 8} y={y(NET_HEIGHT) + 12}>Net</text>
      <line className={styles.apexDrop} x1={apexX} x2={apexX} y1={apexY + 7} y2={FLOOR} />
      <path className={styles.clearLine} pathLength="1" d={clearPath} />
      <path className={styles.flightTrace} pathLength="1" d={clearPath} />
      <circle className={styles.contactDot} cx={startX} cy={startY} r="5" />
      <circle className={styles.returnDot} cx={endX} cy={endY} r="5" />
      <circle className={styles.apexDot} cx={apexX} cy={apexY} r="5" />
      <text className={styles.apexLabel} x={apexX + 12} y={apexY - 6}>{apexHeight.toFixed(1)} m</text>
    </svg>
    <figcaption>One of Axelsen’s clears in the demo match, rebuilt from the broadcast and seen from the side.</figcaption>
  </figure>;
}
