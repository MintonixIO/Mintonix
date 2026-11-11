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

const sharedFeatures = [
  { kind: "collections", title: "Saved collections", caption: "Keep the rallies worth revisiting." },
  { kind: "sharing", title: "Rally sharing", caption: "Send a moment with its context." },
] satisfies { kind: FeatureKind; title: string; caption: string }[];

const viewerFeatures = [
  { title: "Rally detection", caption: "Get straight to the play." },
  { title: "Replay filtering", caption: "Skip the broadcast repeats." },
  { title: "Score navigation", caption: "Choose a score. Revisit the exchange." },
  { title: "Match timeline", caption: "Keep every point in context." },
];

// A real tendency from the dl1 demo match (analysis.patterns.followUps[opponent].lift):
// what each player played next when the other lifted. Shares are of the lifts faced.
const liftAnswers = [
  { tone: "a", name: "Shi Yu Qi", faced: 108, replies: [["Smash", 51], ["Drop", 33], ["Clear", 10], ["Other", 6]] },
  { tone: "b", name: "Viktor Axelsen", faced: 82, replies: [["Smash", 59], ["Drop", 22], ["Clear", 11], ["Other", 9]] },
] as const;
const topShare = Math.max(...liftAnswers.flatMap(player => player.replies.map(([, share]) => share)));

export function FeatureShowcase({ viewer }: { viewer: ReactNode }) {
  return <FeatureMotion>
    <div className={styles.heading}>
      <h2 id="showcase-heading">See more in every rally.</h2>
    </div>

    <section id="common-features" className={styles.commonChapter}>
      <div className={styles.sharedStage}>
        <article className={`${styles.feature} ${styles.reconstruction}`}>
          <div className={styles.featureName}><FeatureIcon kind="flight" /><h4>3D shuttle reconstruction</h4></div>
          <p className={`${styles.featureStatement} ${styles.quote}`}>“How high was that clear, really?”</p>
          <p className={styles.description}>Explore the height, depth, and angle of every shot.</p>
          <FlightIllustration />
          <ul className={styles.keyBenefits}><li>Rotate the court</li><li>Slow the shot</li><li>Follow the flight</li></ul>
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
        <p className={`${styles.chapterTitle} ${styles.quote}`}>“What does he play when I lift?”</p>
      </div>
      <div className={styles.playerTools}>
        <article className={`${styles.feature} ${styles.patterns}`}>
          <div className={styles.featureName}><FeatureIcon kind="patterns" /><h4>Shot patterns</h4></div>
          <p className={styles.description}>One rally shows what happened. A whole match shows what a player tends to do: the reply they favor, the shot that draws it, and how often it ends the rally.</p>
          <figure className={styles.patternExample} data-feature-motion="measure">
            <figcaption className={styles.exampleLabel}>From the demo match: what each player played when the other lifted</figcaption>
            <div className={styles.patternPlayers}>
              {liftAnswers.map(player => <div key={player.name} data-tone={player.tone}>
                <p className={styles.patternPlayer}><strong>{player.name}</strong><span>{player.faced} lifts faced</span></p>
                <ul>
                  {player.replies.map(([reply, share]) => <li key={reply}>
                    <span>{reply}</span>
                    <span className={styles.patternBar} aria-hidden="true"><i style={{ width: `${share / topShare * 100}%` }} /></span>
                    <b>{share}%</b>
                  </li>)}
                </ul>
              </div>)}
            </div>
            <p className={styles.patternReading}>Both attack a lift at least half the time. Shi Yu Qi mixes in the drop on one lift in three; Axelsen goes for the smash more often.</p>
          </figure>
        </article>
      </div>
    </section>

    <section id="viewer-features" className={styles.viewerChapter}>
      <div className={styles.viewerIntro}>
        <div className={styles.chapterIntro}>
          <p className={`${styles.chapterTitle} ${styles.quote}`}>“Skip the waiting. Show me only the rallies.”</p>
        </div>
      </div>
      {viewer}
      <div id="experience" className={styles.viewerDetails}>
        {viewerFeatures.map(feature => <article key={feature.title}>
          <h4>{feature.title}</h4><p>{feature.caption}</p>
        </article>)}
      </div>
    </section>
  </FeatureMotion>;
}
