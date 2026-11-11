import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RallyPlayer } from "@/components/rally-player/rally-player";
import { hasLocalAnalysis, readLocalMatch } from "@/components/rally-player/local-match";
import { formatPlayTime, matchResult } from "@/components/rally-player/coverage";
import { pageMetadata } from "@/components/site/site";
import styles from "./watch.module.css";

type Props = { params: Promise<{ matchId: string }> };

/** Name the tab after the match being watched. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const match = await readLocalMatch((await params).matchId);
  if (!match) return { title: "Rally viewer", robots: { index: false } };
  const [a, b] = match.players;
  const rallies = `${match.rallies.length} ${match.review === "automatic" ? "detected " : ""}${match.rallies.length === 1 ? "rally" : "rallies"}`;
  const analysis = await hasLocalAnalysis(match) ? ", with shot analysis and 3D replays" : "";
  return pageMetadata({
    title: `${a.name} vs ${b.name}`,
    description: `${a.name} vs ${b.name}, ${match.title}. Watch ${rallies} point by point, without the time between them${analysis}.`,
    path: `/watch/${match.matchId}`,
  });
}

async function Match({ params }: Props) {
  const { matchId } = await params;
  const match = await readLocalMatch(matchId);
  if (!match) notFound();
  const [a, b] = match.players;
  const { rallies, source } = match;
  const result = matchResult(match);
  const detected = match.review === "automatic" ? "detected " : "";
  const hasAnalysis = await hasLocalAnalysis(match);
  return (
    <>
      <header className={styles.heading}>
        <h1 className={styles.srOnly}>{a.name} vs {b.name}</h1>
        <p className={styles.event}>{match.title}</p>
        {/* Read like a courtside scoreboard: a row per player, a column per game. */}
        <table className={styles.scoreboard}>
          <caption className={styles.srOnly}>Result by game</caption>
          <thead className={styles.srOnly}>
            <tr><th scope="col">Player</th>{result.games.map((game) => <th key={game.game} scope="col">Game {game.game}</th>)}</tr>
          </thead>
          <tbody>
            {[a, b].map((player, index) => (
              <tr key={player.id} data-tone={index === 0 ? "a" : "b"} data-result={result.winner === null ? undefined : result.winner === player.id ? "won" : "lost"}>
                <th scope="row">
                  <span className={styles.playerName}>{player.name}</span>
                  {result.winner === player.id && <span className={styles.won}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Won</span>}
                </th>
                {result.games.map((game) => (
                  <td key={game.game} data-won={game.winner === player.id || undefined}>
                    {game.score[player.id]}<span className={styles.srOnly}>{game.winner === player.id ? ", won" : ", lost"}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.matchSummary}>
          <span>{rallies.length} {detected}{rallies.length === 1 ? "rally" : "rallies"}, {formatPlayTime(rallies)} of play</span>
          <a className={styles.sourceLink} href={`https://www.youtube.com/watch?v=${source.videoId}`} target="_blank" rel="noopener noreferrer">Watch on YouTube <span aria-hidden="true">↗</span></a>
        </p>
      </header>
      <RallyPlayer key={matchId} match={match} hasAnalysis={hasAnalysis} />
    </>
  );
}

export default function WatchPage({ params }: Props) {
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
