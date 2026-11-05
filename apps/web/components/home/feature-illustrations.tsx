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

/** All diagrams are illustrative concepts, not measurements from a match. */
export function CourtDiagram({ kind = "clear" }: { kind?: "clear" | "drop" | "smash" | "comparison" | "opponent" | "serve" }) {
  return (
    <svg className={styles.courtDiagram} viewBox="0 0 320 150" fill="none" aria-hidden="true">
      <path className={styles.courtSurface} d="M20 30h280l15 105H5L20 30Z" />
      <path className={styles.courtLines} d="M18 42h284M7 123h306M90 30l-4 105M230 30l4 105M20 82h70m140 0h77" />
      <path className={styles.net} d="M160 24v116" />
      {kind === "opponent" ? <>
        <g className={styles.blueFill}><circle cx="226" cy="51" r="5" /><circle cx="251" cy="43" r="5" /><circle cx="272" cy="59" r="5" /></g>
        <g className={styles.purpleFill}><circle cx="231" cy="102" r="5" /><circle cx="255" cy="111" r="5" /><circle cx="274" cy="94" r="5" /></g>
      </> : kind === "serve" ? <>
        <path className={styles.blueLine} d="m40 104 241-51m-11-5 11 5-8 9" /><path className={styles.purpleLine} d="m282 95-211 20m8-8-8 8 9 6" />
        <circle className={styles.blueFill} cx="40" cy="104" r="4" /><circle className={styles.purpleFill} cx="282" cy="95" r="4" />
      </> : <>
        {kind !== "drop" && <path className={styles.blueLine} d={kind === "smash" ? "M180 45 280 112" : "M35 110C90 2 233 1 282 103"} />}
        {(kind === "drop" || kind === "comparison") && <path className={styles.purpleLine} d="M35 110C119 46 214 50 276 121" />}
        <circle className={kind === "drop" ? styles.purpleFill : styles.blueFill} cx={kind === "smash" ? 180 : 35} cy={kind === "smash" ? 45 : 110} r="4" />
        {kind !== "drop" && <circle className={styles.blueFill} cx={kind === "smash" ? 280 : 282} cy={kind === "smash" ? 112 : 103} r="4" />}
        {(kind === "drop" || kind === "comparison") && <circle className={styles.purpleFill} cx="276" cy="121" r="4" />}
      </>}
    </svg>
  );
}

export function SearchIllustration() {
  return <div className={styles.searchVisual} aria-hidden="true">
    <div className={styles.query}><FeatureIcon kind="search" /><span>Long rallies. Crosscourt finishes.</span></div>
    <div className={styles.searchResults}>{(["clear", "comparison", "drop"] as const).map(kind => <div key={kind}><CourtDiagram kind={kind} /></div>)}</div>
  </div>;
}

export function FlightIllustration() {
  return <svg className={styles.flightVisual} viewBox="0 0 600 310" fill="none" aria-hidden="true">
    <path className={styles.courtSurface} d="m171 117 258 0 86 153H85z" />
    <path className={styles.courtLines} d="m182 117-77 153m313-153 77 153M161 135h278M99 245h402M147 160h306M118 211h364M300 117v43m0 51v59" />
    <path className={styles.courtLines} d="M132 151h336v35H132zM132 160h336m-336 9h336m-336 8h336m-308-26v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35m28-35v35" />
    <path className={styles.blueLine} d="M170 247C170 4 350 4 388 137" />
    <path className={styles.purpleLine} d="M170 247C210 61 313 93 328 173" />
    <circle className={styles.blueFill} cx="170" cy="247" r="5" /><circle className={styles.blueFill} cx="388" cy="137" r="5" /><circle className={styles.purpleFill} cx="328" cy="173" r="5" />
  </svg>;
}

export function PatternIllustration() {
  return <div className={styles.sequence} aria-hidden="true">
    {([['clear', 'Deep clear'], ['drop', 'Short lift'], ['smash', 'Attack']] as const).map(([kind, label], index) => <div className={styles.sequenceStep} key={kind}>
      <CourtDiagram kind={kind} />{index < 2 && <span className={styles.sequenceArrow}>→</span>}<span className={styles.sequenceLabel}>{label}</span>
    </div>)}
  </div>;
}

export function ClipIllustration({ stacked = false }: { stacked?: boolean }) {
  return <div className={stacked ? styles.stackedClips : styles.clips} aria-hidden="true">
    {(["clear", "drop", "smash"] as const).map(kind => <div className={styles.clip} key={kind}><CourtDiagram kind={kind} /><span className={styles.playMark}>▷</span><div className={styles.clipLines}><i /><i /></div></div>)}
  </div>;
}

export function PracticeIllustration() {
  return <div className={styles.practiceVisual} aria-hidden="true">{["Lift depth", "Return variety", "Net control"].map((goal, index) => <div key={goal} className={index === 0 ? styles.checkedGoal : undefined}><span>{index === 0 ? "✓" : ""}</span><span>{goal}</span></div>)}</div>;
}

export function SharingIllustration() {
  return <div className={styles.sharingVisual} aria-hidden="true"><div className={styles.sharedClip}><CourtDiagram kind="comparison" /><span className={styles.playMark}>▷</span></div><span>→</span><FeatureIcon kind="sharing" /></div>;
}
