import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import { listLocalMatches } from "@/components/rally-player/local-match";
import { formatPlayTime } from "@/components/rally-player/coverage";
import { formatTime } from "@/components/rally-player/timeline";
import styles from "@/app/(site)/home.module.css";

// User-supplied dl1 measurements. This full-broadcast benchmark is independent
// of whichever match is available in the local library. See docs/rally-playback-benchmark.md.
const benchmark = { broadcastSeconds: 5120, verifiedSeconds: 1648.8 };

function RallyBenchmark() {
  const playPercent = benchmark.verifiedSeconds / benchmark.broadcastSeconds * 100;
  return <article className={styles.comparison} aria-labelledby="benchmark-heading">
    <p className={styles.eyebrow}>Measured on one full broadcast</p>
    <h4 id="benchmark-heading" className={styles.benchmarkHeadline}><strong>{Math.round(100 - playPercent)}<span>%</span></strong><span>less footage.<br />All the verified play.</span></h4>
    <figure className={styles.timeComparison}>
      <div className={styles.comparisonLabel}><span>Full broadcast</span><strong>{formatTime(benchmark.broadcastSeconds)}</strong></div>
      <div className={styles.broadcastBar} aria-hidden="true"><span /></div>
      <div className={styles.comparisonLabel}><span>Verified play</span><strong>{formatTime(Math.round(benchmark.verifiedSeconds))}</strong></div>
      <div className={styles.compactBar} data-feature-motion="measure" aria-hidden="true"><span style={{ width: `${playPercent}%` }} /></div>
    </figure>
    <p className={styles.sampleCaveat}>Main-camera play only. Excludes replays, other camera angles, and dead time.</p>
  </article>;
}

/** Feature only an available, validated match; never invent a playable sample. */
async function AvailableMatch() {
  await io();
  const [match] = await listLocalMatches();
  if (!match) return <EmptySample />;
  const [playerA, playerB] = match.players.map((player) => player.name);
  const detected = match.review === "automatic" ? "detected " : "";

  return <Link className={styles.sampleCard} href={`/watch/${match.matchId}`} aria-label={`Watch rallies: ${playerA} vs ${playerB}`}>
      <div className={styles.sampleImage}>
        <Image src={`https://i.ytimg.com/vi/${match.source.videoId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 760px) 100vw, 45vw" />
        <span className={styles.sampleBadge}>Try the demo</span>
        <span className={styles.samplePlay} aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
      </div>
      <div className={styles.sampleDetails}>
        <p className={styles.sampleEvent}>{match.title}</p>
        <h4>{playerA} <span>vs</span> {playerB}</h4>
        <p className={styles.sampleMeta}>{match.rallies.length} {detected}{match.rallies.length === 1 ? "rally" : "rallies"} <span aria-hidden="true">·</span> {formatPlayTime(match.rallies)} of play</p>
        <span className={styles.sampleAction}>Watch rallies <span aria-hidden="true">→</span></span>
      </div>
    </Link>;
}

function EmptySample() {
  return <div className={styles.emptySample}>
      <p className={styles.eyebrow}>The rally viewer · Early preview</p>
      <h4>A seat at the court.<br />At your own pace.</h4>
      <p>Available matches will appear in the library.</p>
      <Link className={styles.allNotes} href="/library">Explore the library <span aria-hidden="true">→</span></Link>
    </div>;
}

export function FeaturedMatch() {
  return (
    <div id="featured-match" className={styles.sampleGrid}>
      <RallyBenchmark />
      <Suspense fallback={<p role="status">Loading sample match…</p>}>
        <AvailableMatch />
      </Suspense>
    </div>
  );
}
