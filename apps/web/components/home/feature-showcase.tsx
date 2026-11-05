import { ClipIllustration, CourtDiagram, FeatureIcon, FlightIllustration, PatternIllustration, PracticeIllustration, SearchIllustration, SharingIllustration, type FeatureKind } from "./feature-illustrations";
import styles from "./feature-showcase.module.css";

const supportingFeatures = [
  { kind: "comparison", title: "Shot comparison", caption: "Compare height, angle, and depth.", visual: <CourtDiagram kind="comparison" /> },
  { kind: "opponent", title: "Opponent tendencies", caption: "Know the reply to prepare for.", visual: <CourtDiagram kind="opponent" /> },
  { kind: "serve", title: "Serve & return", caption: "Study the opening exchange.", visual: <CourtDiagram kind="serve" /> },
  { kind: "collections", title: "Saved collections", caption: "Keep the rallies worth revisiting.", visual: <ClipIllustration stacked /> },
  { kind: "practice", title: "Practice goals", caption: "Turn patterns into a training plan.", visual: <PracticeIllustration /> },
  { kind: "sharing", title: "Rally sharing", caption: "Send the moment, with its context.", visual: <SharingIllustration /> },
] satisfies { kind: FeatureKind; title: string; caption: string; visual: React.ReactNode }[];

export function FeatureShowcase() {
  return <section id="possibilities" className={styles.showcase} aria-labelledby="showcase-heading" aria-describedby="showcase-status">
    <div className={styles.heading}><h2 id="showcase-heading">Find it. See it. Understand it.</h2><p id="showcase-status">Planned features</p></div>
    <div className={styles.featureGrid}>
      <article className={`${styles.card} ${styles.searchCard}`}>
        <div className={styles.label}><FeatureIcon kind="search" /><span>Rally search</span></div>
        <h3>Find the rally you remember.</h3><p>Search by player, shot, score, or the moment in your mind.</p>
        <SearchIllustration />
      </article>
      <article className={`${styles.card} ${styles.flightCard}`}>
        <div className={styles.label}><FeatureIcon kind="flight" /><span>3D shuttle replay</span></div>
        <h3>Follow every flight.</h3><p>Rotate the court. Slow the exchange. See the trajectory.</p>
        <FlightIllustration />
      </article>
      <article className={`${styles.card} ${styles.patternCard}`}>
        <div className={styles.label}><FeatureIcon kind="patterns" /><span>Shot-pattern analysis</span></div>
        <h3>See how the point was built.</h3><p>Find recurring sequences and the shots that create an opening.</p>
        <PatternIllustration />
      </article>
      <article className={`${styles.card} ${styles.highlightCard}`}>
        <div className={styles.label}><FeatureIcon kind="highlights" /><span>Personalized highlights</span></div>
        <h3>Your kind of badminton.</h3><ClipIllustration />
      </article>
      {supportingFeatures.map(feature => <article key={feature.kind} className={`${styles.card} ${styles.smallCard}`}>
        <h3 className={styles.smallTitle}><FeatureIcon kind={feature.kind} />{feature.title}</h3>
        <div className={styles.smallVisual}>{feature.visual}</div><p>{feature.caption}</p>
      </article>)}
    </div>
  </section>;
}
