import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RallyPlayer } from "@/components/rally-player/rally-player";
import { readLocalMatch } from "@/components/rally-player/local-match";
import { formatTime } from "@/components/rally-player/timeline";
import styles from "./watch.module.css";

export const metadata: Metadata = { title: "Rally viewer" };

async function Match({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = await readLocalMatch(matchId);
  if (!match) notFound();
  const [playerA, playerB] = match.manifest.players;
  const { rallies, source } = match.manifest;
  const rallySeconds = rallies.reduce((total, rally) => total + rally.endSeconds - rally.startSeconds, 0);
  return (
    <>
      <header className={styles.heading}>
        <div className={styles.matchDetails}>
          <h1>
            <span className={styles.playerA}>{playerA}</span>
            <span className={styles.versus}>vs</span>
            <span className={styles.playerB}>{playerB}</span>
          </h1>
          <p className={styles.matchSummary}><span>{rallies.length} detected {rallies.length === 1 ? "rally" : "rallies"}</span><span>{formatTime(rallySeconds)} of play</span></p>
        </div>
        <a className={styles.sourceLink} href={`https://www.youtube.com/watch?v=${source.videoId}`} target="_blank" rel="noopener noreferrer">Watch on YouTube <span aria-hidden="true">↗</span></a>
      </header>
      <RallyPlayer key={matchId} manifest={match.manifest} />
    </>
  );
}

export default function WatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  return (
    <main id="main" className={styles.page}>
      <nav className={styles.navigation} aria-label="Watch navigation">
        <Link className={styles.brandLink} href="/" aria-label="Mintonix home"><Image src="/brand/logomark.png" alt="" width={20} height={23} />mintonix</Link>
        <Link className={styles.backLink} href="/library"><span aria-hidden="true">←</span> All matches</Link>
      </nav>
      <Suspense fallback={<div className={styles.loading} role="status">Loading match…</div>}><Match params={params} /></Suspense>
    </main>
  );
}
