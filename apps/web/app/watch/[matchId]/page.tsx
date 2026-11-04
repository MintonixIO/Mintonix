import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
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
  const [playerA, playerB] = match.manifest.players;
  return (
    <>
      <header className={styles.heading}>
        <h1>
          <span className={styles.playerA}>{playerA}</span>
          <span className={styles.versus}>vs</span>
          <span className={styles.playerB}>{playerB}</span>
        </h1>
        <span className={styles.matchId}>{matchId}</span>
      </header>
      <RallyPlayer key={matchId} manifest={match.manifest} />
    </>
  );
}

export default function WatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  return (
    <main id="main" className={styles.page}>
      <Link className={styles.backLink} href="/" aria-label="Back to Mintonix home"><span aria-hidden="true">←</span><Image src="/brand/logomark.png" alt="" width={15} height={17} />mintonix</Link>
      <Suspense fallback={<p className={styles.loading} role="status">Loading match…</p>}><Match params={params} /></Suspense>
    </main>
  );
}
