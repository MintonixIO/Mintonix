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

/** Illustrative shuttle trajectories, not measurements from a match. */
export function FlightIllustration() {
  return <svg className={styles.flightVisual} viewBox="0 0 600 310" fill="none" aria-hidden="true">
    <path className={styles.courtSurface} d="m171 117 258 0 86 153H85z" />
    <path className={styles.courtLines} d="m182 117-77 153m313-153 77 153M161 135h278M99 245h402M147 160h306M118 211h364M300 117v43m0 51v59" />
    <path className={styles.courtLines} d="M132 151h336v35H132zM132 160h336m-336 9h336m-336 8h336m-308-26v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35" />
    <path className={styles.blueLine} pathLength="1" d="M170 247C170 4 350 4 388 137" />
    <path className={styles.purpleLine} pathLength="1" d="M170 247C210 61 313 93 328 173" />
    <circle className={styles.blueFill} cx="170" cy="247" r="5" /><circle className={styles.blueFill} cx="388" cy="137" r="5" /><circle className={styles.purpleFill} cx="328" cy="173" r="5" />
  </svg>;
}
