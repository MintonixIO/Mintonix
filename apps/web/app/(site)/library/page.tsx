import { Suspense } from "react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { listLocalMatches } from "@/components/rally-player/local-match";
import { formatTime } from "@/components/rally-player/timeline";
import styles from "./library.module.css";

export const metadata: Metadata = {
  title: "Library",
  description: "Browse pre-analyzed badminton matches and jump straight to the rallies.",
};

async function MatchLibrary() {
  await io();
  const matches = await listLocalMatches();

  if (matches.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No matches available yet.</h2>
        <p>Pre-analyzed matches will appear here when they’re ready to watch.</p>
        <Link href="/">Back to home <span aria-hidden="true">→</span></Link>
      </div>
    );
  }

  return (
    <>
      <p className={styles.count}>{matches.length} {matches.length === 1 ? "match" : "matches"} available</p>
      <ul className={styles.matches}>
        {matches.map((match) => (
          <li key={match.matchId}>
            <Link className={styles.match} href={`/watch/${match.matchId}`}>
              <span className={styles.label}>Rally viewer <span aria-hidden="true">↗</span></span>
              <h2>{match.title}</h2>
              <p>{match.players[0]} <span className={styles.versus}>vs</span> {match.players[1]}</p>
              <div className={styles.details}>
                <span>{match.rallies.length} {match.rallies.length === 1 ? "rally" : "rallies"}</span>
                <span>{formatTime(match.source.durationSeconds)} broadcast</span>
                <span className={styles.matchId}>{match.matchId}</span>
              </div>
              <span className={styles.watch}>Watch match <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        ))}
      </ul>
      <p className={styles.note}>Early preview: rally boundaries and scores are automatically detected and may contain errors.</p>
    </>
  );
}

export default function LibraryPage() {
  return (
    <main id="main" className={styles.library}>
      <header className={styles.heading}>
        <h1>Library</h1>
        <p>All your pre-analyzed matches, ready to watch. Pick a match and get straight to the rallies.</p>
      </header>
      <Suspense fallback={<p className={styles.count} role="status">Loading matches…</p>}>
        <MatchLibrary />
      </Suspense>
    </main>
  );
}
