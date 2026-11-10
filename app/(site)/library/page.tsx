import { Suspense } from "react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import { formatPlayTime, matchResult } from "@/components/rally-player/coverage";
import { hasLocalAnalysis, listLocalMatches } from "@/components/rally-player/local-match";
import { formatTime } from "@/components/rally-player/timeline";
import { pageMetadata } from "@/components/site/site";
import styles from "./library.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Badminton match library",
  description: "Badminton matches to watch rally by rally, with shot analysis and 3D replays. One demo match for now; more will be added.",
  path: "/library",
});

async function MatchLibrary() {
  await io();
  const matches = await Promise.all((await listLocalMatches()).map(async (match) => ({ match, analysed: await hasLocalAnalysis(match), result: matchResult(match) })));

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
      <ul className={styles.matches}>
        {matches.map(({ match, analysed, result }, index) => {
          const [a, b] = match.players;
          return (
            <li key={match.matchId}>
              <Link className={styles.match} href={`/watch/${match.matchId}`} aria-label={`Watch rallies: ${a.name} vs ${b.name}, ${match.title}`}>
                <div className={styles.thumbnail}>
                  <Image src={`https://i.ytimg.com/vi/${match.source.videoId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 760px) 100vw, 580px" loading={index < 2 ? "eager" : "lazy"} />
                  <span className={styles.play} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
                  <span className={styles.duration}>{formatPlayTime(match.rallies)} of play</span>
                </div>
                <div className={styles.body}>
                  <p className={styles.event}>{match.title}</p>
                  <h2>
                    <span data-tone="a">{a.name}</span>
                    <span className={styles.versus}>vs</span>
                    <span data-tone="b">{b.name}</span>
                  </h2>
                  {result.games.length > 0 && (
                    <p className={styles.result}>
                      {result.winner && <span>{match.players.find((player) => player.id === result.winner)!.name} won</span>}
                      <span className={styles.scores}>{result.games.map((game) => `${game.score[a.id]}–${game.score[b.id]}`).join("  ")}</span>
                    </p>
                  )}
                  <ul className={styles.details}>
                    <li>{match.rallies.length} {match.review === "automatic" ? "detected " : ""}{match.rallies.length === 1 ? "rally" : "rallies"}</li>
                    <li>{formatTime(match.source.durationSeconds)} broadcast</li>
                    <li>{analysed ? "Shot analysis and 3D replays" : "Rallies only"}</li>
                  </ul>
                  <span className={styles.watch}>Watch rallies <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {matches.some(({ match }) => match.review === "automatic") && <p className={styles.note}>Early preview: rally boundaries and scores in automatically detected matches may contain errors.</p>}
    </>
  );
}

export default function LibraryPage() {
  return (
    <main id="main" className={styles.library}>
      <header className={styles.heading}>
        <h1>Library</h1>
        <p>One demo match for now, with every rally ready to watch. More matches will be added here.</p>
      </header>
      <Suspense fallback={<p className={styles.count} role="status">Loading matches…</p>}>
        <MatchLibrary />
      </Suspense>
    </main>
  );
}
