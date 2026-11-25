import { Suspense } from "react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import { formatPlayTime, matchResult } from "@/components/rally-player/coverage";
import { hasLocalAnalysis, listLocalMatches } from "@/components/rally-player/local-match";
import { groupMatchesByEvent } from "@/components/rally-player/library";
import { pageMetadata } from "@/components/site/site";
import styles from "./library.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Badminton match library",
  description: "Badminton matches to watch rally by rally, with shot analysis and 3D replays: finals and semifinals from the 2025 BWF World Tour.",
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

  const groups = groupMatchesByEvent(matches);

  return (
    <>
      <p className={styles.count}>{matches.length} {matches.length === 1 ? "match" : "matches"} from {groups.length} {groups.length === 1 ? "tournament" : "tournaments"}</p>
      {groups.length > 1 && (
        <nav className={styles.events} aria-label="Tournaments">
          <ul>
            {groups.map((group, index) => <li key={group.event}><a href={`#event-${index + 1}`}>{group.event}</a></li>)}
          </ul>
        </nav>
      )}
      {groups.map((group, groupIndex) => (
        <section key={group.event} id={`event-${groupIndex + 1}`} className={styles.group} aria-labelledby={`event-${groupIndex + 1}-title`}>
          <h2 id={`event-${groupIndex + 1}-title`} className={styles.groupTitle}>
            {group.event}
            <span>{group.items.length} {group.items.length === 1 ? "match" : "matches"}</span>
          </h2>
          <ul className={styles.matches}>
            {group.items.map(({ match, analysed, result, round }) => {
              const [a, b] = match.players;
              return (
                <li key={match.matchId}>
                  <Link className={styles.match} href={`/watch/${match.matchId}`} aria-label={`Watch rallies: ${a.name} vs ${b.name}, ${match.title}`}>
                    <div className={styles.thumbnail}>
                      <Image src={`https://i.ytimg.com/vi/${match.source.videoId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, 330px" loading={groupIndex === 0 ? "eager" : "lazy"} />
                      <span className={styles.play} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
                      <span className={styles.duration}>{formatPlayTime(match.rallies)} of play</span>
                    </div>
                    <div className={styles.body}>
                      {round && <p className={styles.event}>{round}</p>}
                      <h3>
                        <span data-tone="a">{a.name}</span>
                        <span className={styles.versus}>vs</span>
                        <span data-tone="b">{b.name}</span>
                      </h3>
                      {result.games.length > 0 && (
                        <p className={styles.result}>
                          {result.winner && <span>{match.players.find((player) => player.id === result.winner)!.name} won</span>}
                          <span className={styles.scores}>{result.games.map((game) => `${game.score[a.id]}–${game.score[b.id]}`).join("  ")}</span>
                        </p>
                      )}
                      <ul className={styles.details}>
                        <li>{match.rallies.length} {match.review === "automatic" ? "detected " : ""}{match.rallies.length === 1 ? "rally" : "rallies"}</li>
                        {analysed && <li>Shot analysis</li>}
                        {match.poses && <li>3D court</li>}
                      </ul>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {matches.some(({ match }) => match.review === "automatic") && <p className={styles.note}>Early preview: rally boundaries and scores in automatically detected matches may contain errors. Shot analysis and 3D courts are estimates from the broadcast that were not checked by hand.</p>}
    </>
  );
}

export default function LibraryPage() {
  return (
    <main id="main" className={styles.library}>
      <header className={styles.heading}>
        <h1>Library</h1>
        <p>Men’s singles finals and semifinals from the 2025 BWF World Tour, with dead time and replays cut so every rally is ready to watch.</p>
      </header>
      <Suspense fallback={<p className={styles.count} role="status">Loading matches…</p>}>
        <MatchLibrary />
      </Suspense>
    </main>
  );
}
