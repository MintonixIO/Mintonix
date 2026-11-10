import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RallyPlayer } from "@/components/rally-player/rally-player";
import { hasLocalAnalysis, readLocalMatch } from "@/components/rally-player/local-match";
import { ViewSwitch } from "@/components/rally-player/view-switch";
import { formatPlayTime, matchResult, pointCoverage } from "@/components/rally-player/coverage";
import styles from "./watch.module.css";

type Props = { params: Promise<{ matchId: string }> };

/** Name the tab after the match being watched. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const match = await readLocalMatch((await params).matchId);
  if (!match) return { title: "Rally viewer" };
  const [a, b] = match.players;
  return { title: `${a.name} vs ${b.name}`, description: `${match.title}. Watch every rally, point by point.` };
}

async function Match({ params }: Props) {
  const { matchId } = await params;
  const match = await readLocalMatch(matchId);
  if (!match) notFound();
  const [a, b] = match.players;
  const { rallies, source } = match;
  const result = matchResult(match);
  const coverage = pointCoverage(rallies);
  const detected = match.review === "automatic" ? "detected " : "";
  const hasAnalysis = await hasLocalAnalysis(match);
  return (
    <>
      <header className={styles.heading}>
        <div className={styles.matchDetails}>
          <p className={styles.event}>{match.title}</p>
          <h1>
            <span className={styles.playerA}>{a.name}{result.winner === a.id && <span className={styles.won}>Won {result.gamesWon[a.id]}–{result.gamesWon[b.id]}</span>}</span>
            <span className={styles.versus}>vs</span>
            <span className={styles.playerB}>{b.name}{result.winner === b.id && <span className={styles.won}>Won {result.gamesWon[b.id]}–{result.gamesWon[a.id]}</span>}</span>
          </h1>
          {result.games.length > 0 && (
            <ol className={styles.scoreline} aria-label="Game scores">
              {result.games.map((game) => (
                <li key={game.game}>
                  <span className={styles.srOnly}>Game {game.game}: </span>
                  <b data-tone="a" data-won={game.winner === a.id || undefined}>{game.score[a.id]}</b>
                  <span aria-hidden="true">–</span><span className={styles.srOnly}> to </span>
                  <b data-tone="b" data-won={game.winner === b.id || undefined}>{game.score[b.id]}</b>
                </li>
              ))}
            </ol>
          )}
          <p className={styles.matchSummary}>
            <span>{rallies.length} {detected}{rallies.length === 1 ? "rally" : "rallies"}</span>
            {coverage.missing > 0 && <span>{coverage.missing} not shown</span>}
            <span>{formatPlayTime(rallies)} of play</span>
          </p>
        </div>
        <div className={styles.headerActions}>
        {hasAnalysis && <ViewSwitch />}
        <a className={styles.sourceLink} href={`https://www.youtube.com/watch?v=${source.videoId}`} target="_blank" rel="noopener noreferrer">Watch on YouTube <span aria-hidden="true">↗</span></a>
        </div>
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
