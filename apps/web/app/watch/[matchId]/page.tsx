import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RallyPlayer } from "@/components/rally-player/rally-player";
import { readLocalMatch } from "@/components/rally-player/local-match";
import styles from "./watch.module.css";

export const metadata: Metadata = { title: "Rally viewer" };

async function Match({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = await readLocalMatch(matchId);
  if (!match) notFound();
  return (
    <>
      <header className={styles.heading}>
        <p>DETECTED MATCH · {matchId}</p>
        <h1>{match.manifest.players.join(" vs ")}</h1>
        <span>Select a rally, or play through with the gaps skipped.</span>
      </header>
      <RallyPlayer key={matchId} manifest={match.manifest} videoSrc={`/watch/${matchId}/video`} />
    </>
  );
}

export default function WatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  return (
    <main id="main" className={styles.page}>
      <Link className={styles.backLink} href="/">← Back to Mintonix</Link>
      <Suspense fallback={<p role="status">Loading match…</p>}><Match params={params} /></Suspense>
    </main>
  );
}
