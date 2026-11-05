import Image from "next/image";
import Link from "next/link";
import { io } from "next/cache";
import { listLocalMatches } from "@/components/rally-player/local-match";
import { formatTime } from "@/components/rally-player/timeline";
import styles from "@/app/(site)/home.module.css";

/** Feature only an available, validated manifest; never invent a playable sample. */
export async function FeaturedMatch() {
  await io();
  const [match] = await listLocalMatches();

  if (!match) {
    return (
      <section id="featured-match" className={styles.featured} aria-labelledby="sample-heading">
        <p className={styles.eyebrow}>The rally viewer</p>
        <h2 id="sample-heading">Your time. More play.</h2>
        <p className={styles.sectionDescription}>Skip between detected rallies and revisit points by score. Sample matches will appear in the library when they’re ready to watch.</p>
        <Link className={styles.allNotes} href="/library">Explore the library <span aria-hidden="true">→</span></Link>
      </section>
    );
  }

  const first = match.rallies[0].startSeconds;
  const last = match.rallies[match.rallies.length - 1].endSeconds;
  // Compare only the analyzed excerpt, never the entire source video.
  const excerptSeconds = last - first;
  const rallySeconds = match.rallies.reduce((total, rally) => total + rally.endSeconds - rally.startSeconds, 0);
  const excerptTime = formatTime(Math.round(excerptSeconds));
  const rallyTime = formatTime(Math.round(rallySeconds));
  const savedTime = formatTime(Math.round(excerptSeconds) - Math.round(rallySeconds));
  const rallyPercent = (rallySeconds / excerptSeconds) * 100;

  return (
    <section id="featured-match" className={styles.featured} aria-labelledby="sample-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>See it in action</p>
          <h2 id="sample-heading">More of the play. Less of the wait.</h2>
          <p>Try a real match excerpt and see how rally playback makes room for more badminton.</p>
        </div>
        <Link className={styles.allNotes} href="/library">Browse matches <span aria-hidden="true">→</span></Link>
      </div>

      <div className={styles.sampleGrid}>
        <Link className={styles.sampleCard} href={`/watch/${match.matchId}`} aria-label={`Watch rallies: ${match.players[0]} vs ${match.players[1]}`}>
          <div className={styles.sampleImage}>
            <Image src={`https://i.ytimg.com/vi/${match.source.videoId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 760px) 100vw, 50vw" />
            <span className={styles.sampleBadge}>Match excerpt · Early preview</span>
            <span className={styles.samplePlay} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
          </div>
          <div className={styles.sampleDetails}>
            <p className={styles.sampleEvent}>{match.title}</p>
            <h3>{match.players[0]} <span>vs</span> {match.players[1]}</h3>
            <p className={styles.sampleMeta}>{match.rallies.length} detected {match.rallies.length === 1 ? "rally" : "rallies"} <span aria-hidden="true">·</span> {rallyTime} rally playback</p>
            <span className={styles.sampleAction}>Watch rallies <span aria-hidden="true">→</span></span>
          </div>
        </Link>

        <div className={styles.comparison}>
          <p className={styles.eyebrow}>Same excerpt. Straight to the points.</p>
          <h3>Make more time<br />for the exchanges.</h3>
          <p>Rally playback jumps over the gaps between detected points, so you can spend less time waiting for the next serve.</p>

          <figure className={styles.timeComparison} aria-label={`This excerpt runs ${excerptTime} in the original broadcast and ${rallyTime} with detected rallies only. ${savedTime} between detected rallies is skipped.`}>
            <div className={styles.comparisonLabel}><span>Original excerpt</span><strong>{excerptTime}</strong></div>
            <div className={styles.broadcastBar} aria-hidden="true">
              {match.rallies.map((rally) => <span key={rally.id} style={{ left: `${((rally.startSeconds - first) / excerptSeconds) * 100}%`, width: `${((rally.endSeconds - rally.startSeconds) / excerptSeconds) * 100}%` }} />)}
            </div>
            <div className={styles.comparisonLabel}><span>Detected rallies only</span><strong>{rallyTime}</strong></div>
            <div className={styles.compactBar} aria-hidden="true"><span style={{ width: `${rallyPercent}%` }} /></div>
            <figcaption><strong>{savedTime}</strong> between detected rallies skipped in this excerpt.</figcaption>
          </figure>
          <p className={styles.sampleCaveat}>Based on {formatTime(first)}–{formatTime(last)} of the original video, not the full match. Automatic rally detection and scores may contain errors.</p>
        </div>
      </div>
    </section>
  );
}
