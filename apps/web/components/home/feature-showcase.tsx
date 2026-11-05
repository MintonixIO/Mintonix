import { FeatureIcon, FlightIllustration, type FeatureKind } from "./feature-illustrations";
import styles from "./feature-showcase.module.css";

const supportingFeatures = [
  { kind: "highlights", title: "Personalized highlights", caption: "Follow your favorite players and the kinds of rallies you love." },
  { kind: "comparison", title: "Shot comparison", caption: "Compare trajectories to see differences in height, angle, and depth." },
  { kind: "opponent", title: "Opponent scouting", caption: "Spot preferred replies and predictable placements before a match." },
  { kind: "practice", title: "Training insights", caption: "Turn match patterns into practice goals and track your progress." },
] satisfies { kind: FeatureKind; title: string; caption: string }[];

const additionalFeatures = [
  { kind: "serve", title: "Serve & return", caption: "Study the opening exchange." },
  { kind: "collections", title: "Saved collections", caption: "Keep the rallies worth revisiting." },
  { kind: "sharing", title: "Rally sharing", caption: "Send a moment with its context." },
] satisfies { kind: FeatureKind; title: string; caption: string }[];

export function FeatureShowcase() {
  return <section id="possibilities" className={styles.showcase} aria-labelledby="showcase-heading" aria-describedby="showcase-status">
    <div className={styles.heading}>
      <h2 id="showcase-heading">See more in every rally.</h2>
      <p id="showcase-status">Planned features</p>
    </div>
    <div className={styles.featureGrid}>
      <article className={`${styles.card} ${styles.reconstruction}`}>
        <div className={styles.featureName}><FeatureIcon kind="flight" /><h3>3D shuttle reconstruction</h3></div>
        <p>See the shuttle’s full flight in three dimensions. Explore the height, depth, and angle of every shot.</p>
        <ul className={styles.keyBenefits}>
          <li>Rotate the court</li>
          <li>Slow down an exchange</li>
          <li>Follow every trajectory</li>
        </ul>
        <FlightIllustration />
      </article>
      <article className={`${styles.card} ${styles.primaryCard}`}>
        <div className={styles.featureName}><FeatureIcon kind="search" /><h3>Rally search</h3></div>
        <p>Find the exchange you remember by player, shot, score, or a simple description.</p>
        <div className={styles.searchExample}>
          <span className={styles.exampleLabel}>Imagine searching</span>
          <p>“Long rallies with a crosscourt finish.”</p>
          <div className={styles.searchTags} aria-hidden="true"><span>Player</span><span>Shot</span><span>Score</span></div>
        </div>
      </article>
      <article className={`${styles.card} ${styles.primaryCard}`}>
        <div className={styles.featureName}><FeatureIcon kind="patterns" /><h3>Shot patterns</h3></div>
        <p>Discover recurring combinations and the setup shots that create an opening.</p>
        <div className={styles.patternExample}>
          <span className={styles.exampleLabel}>An exchange, explained</span>
          <ol><li>Tight net shot</li><li>Short lift</li><li>Attacking finish</li></ol>
        </div>
      </article>
      {supportingFeatures.map(feature => <article key={feature.kind} className={`${styles.card} ${styles.supportingCard}`}>
        <FeatureIcon kind={feature.kind} />
        <h3>{feature.title}</h3><p>{feature.caption}</p>
      </article>)}
    </div>
    <div className={styles.additionalFeatures}>
      {additionalFeatures.map(feature => <article key={feature.kind}>
        <FeatureIcon kind={feature.kind} /><div><h3>{feature.title}</h3><p>{feature.caption}</p></div>
      </article>)}
    </div>
  </section>;
}
