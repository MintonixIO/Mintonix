import Link from "next/link";
import { Suspense } from "react";
import { MatchLinkForm } from "@/components/match-link/match-link-form";
import { RallyDemo } from "@/components/home/rally-demo";
import { FeaturedMatch } from "@/components/home/featured-match";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main id="main">
      <section id="generate" className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <h1 id="page-title">Watch the rally.<br /><span>Read the game.</span></h1>
          <p className={styles.heroDescription}>Your favorite rallies. A closer look at every shot.</p>
          <MatchLinkForm />
          <p className={styles.previewNote}>Early preview · Match-link processing is coming soon.</p>
          <p className={styles.localMatch}>
            <Link href="/library"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>Library</Link>
            <span>Try the viewer with an available match</span>
          </p>
        </div>

        <RallyDemo />

        <a href="#possibilities" className={styles.scrollArrow} aria-label="Explore Mintonix features"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></a>
      </section>

      <FeatureShowcase />

      <Suspense fallback={<section className={styles.featured} aria-label="Sample match"><p role="status">Loading sample match…</p></section>}>
        <FeaturedMatch />
      </Suspense>

      <section id="experience" className={styles.features} aria-labelledby="features-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="features-heading">Built for watching.</h2>
          </div>
        </div>

        <div className={styles.featureGrid}>
          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Rally detection</span><span className={styles.status}>In development</span></div>
            <div className={`${styles.illustration} ${styles.detection}`} aria-hidden="true">
              <div className={styles.trackLabel}>Full match</div>
              <div className={styles.sourceTrack}><i /><i /><i /><i /><i /></div>
              <div className={styles.trackConnector}>↓</div>
              <div className={styles.rallyTrack}><span>Rally 1</span><span>Rally 2</span><span>Rally 3</span></div>
            </div>
            <h3>Get straight to the play.</h3>
            <p>Less waiting between points.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Replay filtering</span><span className={styles.status}>In development</span></div>
            <div className={`${styles.illustration} ${styles.replay}`} aria-hidden="true">
              <div className={styles.liveClip}><span className={styles.clipIcon}>▷</span><div><strong>Original rally</strong><span>Keep the point</span></div><span className={styles.clipCheck}>✓</span></div>
              <div className={styles.replayClip}><span className={styles.clipIcon}>↺</span><div><strong>Broadcast replay</strong><span>Skip the repeat</span></div><span className={styles.clipSkip}>−</span></div>
            </div>
            <h3>See each point once.</h3>
            <p>The next point, without the repeat.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Score navigation</span><span className={styles.status}>In the viewer</span></div>
            <div className={`${styles.illustration} ${styles.scoreNavigation}`} aria-hidden="true">
              <div className={styles.scoreStrip}><span>18 <i>–</i> 17</span><span>18 <i>–</i> 18</span><span className={styles.pickedScore}><b className={styles.scoreA}>19</b> <i>–</i> <b className={styles.scoreB}>18</b></span></div>
              <div className={styles.scoreCaption}><span className={styles.selectionDot} /> A score becomes a shortcut.</div>
            </div>
            <h3>Find the point you came for.</h3>
            <p>Choose a score. Revisit the exchange.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Match timeline</span><span className={styles.status}>In the viewer</span></div>
            <div className={`${styles.illustration} ${styles.timelinePreview}`} aria-hidden="true">
              <div className={styles.timelineCaption}><span>Original match</span><span>Rallies highlighted</span></div>
              <div className={styles.matchTrack}><i /><i /><i /><i /><i /><i /><span className={styles.trackHandle} /></div>
              <div className={styles.timelineEnds}><span>Start of match</span><span>Match point</span></div>
            </div>
            <h3>Keep your place in the match.</h3>
            <p>Every rally, in its original match context.</p>
          </article>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-heading">
        <div>
          <p className={styles.eyebrow}>More time for the game</p>
          <h2 id="closing-heading">Get to the next rally.</h2>
        </div>
        <Link className={styles.primaryLink} href="/library">Try the rally viewer <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}
