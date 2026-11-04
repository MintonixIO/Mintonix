import Link from "next/link";
import { MatchLinkForm } from "@/components/match-link/match-link-form";
import { RallyDemo } from "@/components/home/rally-demo";
import { formatPostDate, getPosts } from "@/components/blog/posts";
import styles from "./home.module.css";

export default function Home() {
  const posts = getPosts().slice(0, 3);
  return (
    <main id="main">
      <section id="generate" className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <h1 id="page-title">Your BWF match.<br /><span>Just the rallies.</span></h1>
          <p className={styles.heroDescription}>Start with a match link. Get closer to the play with a view built around rallies, scores, and the moments you want to revisit.</p>
          <MatchLinkForm />
          {process.env.MINTONIX_LOCAL_MATCHES_DIR && (
            <p className={styles.localMatch}>
              <Link href="/watch/dl1s0"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>Watch the dl1s0 match</Link>
              <span>Detected from 11 research clips</span>
            </p>
          )}
        </div>

        <RallyDemo />

        <a href="#experience" className={styles.scrollArrow} aria-label="See what the viewer does"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></a>
      </section>

      <section id="experience" className={styles.features} aria-labelledby="features-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="features-heading">A better way through the match.</h2>
            <p>Less time searching through the broadcast, more time watching the badminton.</p>
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
            <p>Rally detection finds where each live point starts and ends, so the walking, towel breaks, and between-point waits can be skipped.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Replay filtering</span><span className={styles.status}>In development</span></div>
            <div className={`${styles.illustration} ${styles.replay}`} aria-hidden="true">
              <div className={styles.liveClip}><span className={styles.clipIcon}>▷</span><div><strong>Original rally</strong><span>Keep the point</span></div><span className={styles.clipCheck}>✓</span></div>
              <div className={styles.replayClip}><span className={styles.clipIcon}>↺</span><div><strong>Broadcast replay</strong><span>Skip the repeat</span></div><span className={styles.clipSkip}>−</span></div>
            </div>
            <h3>See each point once.</h3>
            <p>The replay filter separates live rallies from slow-motion repeats, so you follow the match’s rhythm without watching the same exchange twice.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Score navigation</span><Link href="/blog/original-video-timestamps">Read the notes</Link></div>
            <div className={`${styles.illustration} ${styles.scoreNavigation}`} aria-hidden="true">
              <div className={styles.scoreStrip}><span>18 <i>–</i> 17</span><span>18 <i>–</i> 18</span><span className={styles.pickedScore}><b className={styles.scoreA}>19</b> <i>–</i> <b className={styles.scoreB}>18</b></span></div>
              <div className={styles.scoreCaption}><span className={styles.selectionDot} /> A score becomes a shortcut.</div>
            </div>
            <h3>Find the point you came for.</h3>
            <p>Choose a score to jump to its rally. Revisit a turning point or study an exchange without hunting for its timestamp.</p>
          </article>

          <article className={styles.feature}>
            <div className={styles.featureTop}><span>Match timeline</span><Link href="/blog/original-video-timestamps">Read the notes</Link></div>
            <div className={`${styles.illustration} ${styles.timelinePreview}`} aria-hidden="true">
              <div className={styles.timelineCaption}><span>Original match</span><span>Rallies highlighted</span></div>
              <div className={styles.matchTrack}><i /><i /><i /><i /><i /><i /><span className={styles.trackHandle} /></div>
              <div className={styles.timelineEnds}><span>Start of match</span><span>Match point</span></div>
            </div>
            <h3>Keep your place in the match.</h3>
            <p>Every rally is highlighted on the original video timeline. Drag to any moment while keeping the whole match in view.</p>
          </article>
        </div>
      </section>

      <section id="notes" className={styles.notes} aria-labelledby="notes-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="notes-heading">How it’s built.</h2>
            <p>Technical write-ups on rally detection, replay handling, and match playback, published as the work happens.</p>
          </div>
          <Link className={styles.allNotes} href="/blog">Read all technical notes</Link>
        </div>
        <ul className={styles.noteList}>
          {posts.map((post) => (
            <li key={post.slug}>
              <Link className={styles.note} href={`/blog/${post.slug}`}>
                <span className={styles.noteCategory}>{post.category}</span>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <span className={styles.noteMeta}><time dateTime={post.date}>{formatPostDate(post.date)}</time>, {post.readingMinutes} min read</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
