import type { ReactNode } from "react";
import { FeatureIcon, FlightIllustration, type FeatureKind } from "./feature-illustrations";
import { FeatureMotion } from "./feature-motion";
import styles from "./feature-showcase.module.css";

// Highlighted phrases are the parts a search would match on.
const searchSegments = [
  { text: "“", match: false },
  { text: "Long rallies", match: true },
  { text: " with a ", match: false },
  { text: "crosscourt finish", match: true },
  { text: ".”", match: false },
];
const searchLetters = searchSegments.flatMap(segment => Array.from(segment.text, letter => ({ letter, match: segment.match })));

const searchTags = ["Player", "Opponent", "Shot", "Score", "Rally length", "Court zone", "Tournament", "Round"];

const sharedFeatures = [
  { kind: "collections", title: "Saved collections", caption: "Keep the rallies worth revisiting." },
  { kind: "sharing", title: "Rally sharing", caption: "Send a moment with its context." },
] satisfies { kind: FeatureKind; title: string; caption: string }[];

const viewerFeatures = [
  { title: "Rally detection", caption: "Get straight to the play.", status: "In development" },
  { title: "Replay filtering", caption: "Skip the broadcast repeats.", status: "In development" },
  { title: "Score navigation", caption: "Choose a score. Revisit the exchange.", status: "In the viewer" },
  { title: "Match timeline", caption: "Keep every point in context.", status: "In the viewer" },
];

export function FeatureShowcase({ viewer }: { viewer: ReactNode }) {
  return <FeatureMotion>
    <div className={styles.heading}>
      <h2 id="showcase-heading">See more in every rally.</h2>
    </div>

    <section id="common-features" className={styles.commonChapter}>
      <div className={styles.sharedStage}>
        <article className={`${styles.feature} ${styles.reconstruction}`}>
          <div className={styles.featureName}><FeatureIcon kind="flight" /><h4>3D shuttle reconstruction</h4></div>
          <p className={styles.featureStatement}>A whole new<br />point of view.</p>
          <p className={styles.description}>Explore the height, depth, and angle of every shot.</p>
          <FlightIllustration />
          <ul className={styles.keyBenefits}><li>Rotate the court</li><li>Slow the exchange</li><li>Follow the flight</li></ul>
        </article>
        <div className={styles.sharedRail}>
          <article className={`${styles.feature} ${styles.search}`}>
            <div className={styles.featureName}><FeatureIcon kind="search" /><h4>Rally search</h4></div>
            <div className={styles.searchExample}>
              <span className={styles.exampleLabel}>Imagine searching</span>
              <p className={styles.query} data-feature-motion="type">
                <span className={styles.queryText}>{searchSegments.map((segment, index) => segment.match ? <mark key={index}>{segment.text}</mark> : segment.text)}</span>
                <span className={styles.typedText} aria-hidden="true">
                  {searchLetters.map(({ letter, match }, index) => (
                    <span key={index} className={match ? styles.match : undefined} style={{ animationDelay: `${index * 55}ms` }}>{letter}</span>
                  ))}
                </span>
              </p>
              <div className={styles.searchTags} aria-hidden="true">{searchTags.map(tag => <span key={tag}>{tag}</span>)}</div>
            </div>
          </article>
          <div className={styles.sharedUtilities}>
            {sharedFeatures.map(feature => <article key={feature.kind} className={styles.smallFeature}>
              <FeatureIcon kind={feature.kind} /><h4>{feature.title}</h4><p>{feature.caption}</p>
            </article>)}
          </div>
        </div>
      </div>
    </section>

    <section id="player-features" className={styles.playerChapter}>
      <div className={styles.chapterIntro}>
        <p className={styles.chapterTitle}>Read the pattern.<br /><span>Find your edge.</span></p>
      </div>
      <div className={styles.playerTools}>
        <article className={`${styles.feature} ${styles.patterns}`}>
          <div className={styles.featureName}><FeatureIcon kind="patterns" /><h4>Shot patterns</h4></div>
          <p className={styles.description}>See the setup behind the winning shot.</p>
          <div className={styles.patternExample} data-feature-motion="sequence">
            <span className={styles.exampleLabel}>An illustrative exchange</span>
            <ol>
              <li><span>01</span><strong>Tight net shot</strong><small>Create pressure</small></li>
              <li><span>02</span><strong>Short lift</strong><small>Find the opening</small></li>
              <li><span>03</span><strong>Attacking finish</strong><small>Take the point</small></li>
            </ol>
          </div>
        </article>
      </div>
    </section>

    <section id="viewer-features" className={styles.viewerChapter}>
      <div className={styles.viewerIntro}>
        <div className={styles.chapterIntro}>
          <p className={styles.chapterTitle}>Your time.<br /><span>More badminton.</span></p>
        </div>
      </div>
      {viewer}
      <div id="experience" className={styles.viewerDetails}>
        {viewerFeatures.map(feature => <article key={feature.title}>
          <h4>{feature.title}</h4><p>{feature.caption}</p><span>{feature.status}</span>
        </article>)}
      </div>
    </section>
  </FeatureMotion>;
}
