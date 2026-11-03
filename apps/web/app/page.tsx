import Link from "next/link";
import { MatchLinkForm } from "@/components/match-link/match-link-form";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main id="main">
      <section id="generate" className={styles.hero} aria-labelledby="page-title">
        <h1 id="page-title">Your BWF match.<br /><span>Just the rallies.</span></h1>
        <p className={styles.heroDescription}>Start with a match link. Get closer to the play with a view built around rallies, scores, and the moments you want to revisit.</p>
        <MatchLinkForm />
        {process.env.MINTONIX_LOCAL_MATCHES_DIR && <p className={styles.localMatch}><Link href="/watch/dl1s0">Watch dl1s0 <span aria-hidden="true">↗</span></Link><span>Detected from 11 research clips</span></p>}
        <a href="#experience" className={styles.scrollArrow} aria-label="Explore the Mintonix components"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></a>
      </section>

      <section id="experience" className={styles.features} aria-labelledby="features-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Inside the experience</p><h2 id="features-heading">A better way through the match.</h2></div>
          <p>Each tool has a purpose: less time searching through the broadcast, more time watching the badminton.</p>
        </div>

        <div className={styles.featureGrid}>
          <article className={styles.feature}>
            <div className={styles.featureTop}><span>01 / RALLY DETECTION</span><span className={styles.planned}>IN DEVELOPMENT</span></div>
            <div className={`${styles.illustration} ${styles.detection}`} aria-hidden="true">
              <div className={styles.trackLabel}>FULL MATCH</div>
              <div className={styles.sourceTrack}><i /><i /><i /><i /><i /></div>
              <div className={styles.trackConnector}>↓</div>
              <div className={styles.rallyTrack}><span>RALLY 01</span><span>RALLY 02</span><span>RALLY 03</span></div>
            </div>
            <h3>Get straight to the play.</h3>
            <p>Rally detection is designed to find where each live point starts and ends, so the walking, towel breaks, and between-point waits can be skipped.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>02 / REPLAY FILTERING</span><span className={styles.planned}>IN DEVELOPMENT</span></div>
            <div className={`${styles.illustration} ${styles.replay}`} aria-hidden="true">
              <div className={styles.liveClip}><span className={styles.clipIcon}>▷</span><div><strong>Original rally</strong><span>Keep the point</span></div><span className={styles.clipCheck}>✓</span></div>
              <div className={styles.replayClip}><span className={styles.clipIcon}>↺</span><div><strong>Broadcast replay</strong><span>Skip the repeat</span></div><span className={styles.clipSkip}>−</span></div>
            </div>
            <h3>See each point once.</h3>
            <p>The replay filter is designed to separate live rallies from slow-motion repeats. Follow the match’s rhythm without watching the same exchange again.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>03 / SCORE NAVIGATION</span><Link href="/blog/original-video-timestamps">READ THE NOTES ↗</Link></div>
            <div className={`${styles.illustration} ${styles.scoreNavigation}`} aria-hidden="true">
              <div className={styles.scoreStrip}><span>18 <i>–</i> 17</span><span>18 <i>–</i> 18</span><span className={styles.pickedScore}>19 <i>–</i> 18 <b>↗</b></span></div>
              <div className={styles.scoreCaption}><span className={styles.selectionDot} /> A score becomes a shortcut.</div>
            </div>
            <h3>Find the point you came for.</h3>
            <p>Choose a score to jump to its rally. Revisit a turning point or study an exchange without hunting for its timestamp in the broadcast.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>04 / MATCH TIMELINE</span><Link href="/blog/original-video-timestamps">READ THE NOTES ↗</Link></div>
            <div className={`${styles.illustration} ${styles.timelinePreview}`} aria-hidden="true">
              <div className={styles.timelineCaption}><span>ORIGINAL MATCH</span><span>Rallies highlighted</span></div>
              <div className={styles.matchTrack}><i /><i /><i /><i /><i /><i /><span className={styles.trackHandle} /></div>
              <div className={styles.timelineEnds}><span>Start of match</span><span>Match point</span></div>
            </div>
            <h3>Keep your place in the match.</h3>
            <p>See every rally highlighted on the original video timeline. Drag to any moment while keeping the full match’s context in view.</p>
          </article>
        </div>
      </section>

    </main>
  );
}
