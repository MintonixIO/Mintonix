"use client";

import { useEffect, useRef } from "react";
import type { Match, MatchAnalysis } from "../contract";
import { rallySeconds } from "../timeline";
import { PlacementMap } from "./court-drawing";
import { METRICS, playerTools } from "./players";
import { gameSummaries } from "./summary";
import styles from "./analysis.module.css";

type Distribution = MatchAnalysis["players"][string]["speed"];

/** p10–p90 band with a median tick, on a shared scale; `mark` adds one shot's value. */
export function RangeRow({ label, unit, scale, digits, domain, stats, mark, markLabel }: {
  label: string; unit: string; scale: number; digits: number; domain: [number, number]; stats: Distribution;
  mark?: number | null; markLabel?: string;
}) {
  const at = (v: number) => `${Math.max(0, Math.min(100, (v * scale - domain[0]) / (domain[1] - domain[0]) * 100))}%`;
  const hasBand = stats.n > 0 && stats.median !== undefined;
  if (!hasBand && (mark === undefined || mark === null)) return <div className={styles.rangeRow}><span>{label}</span><span className={styles.rangeEmpty}>Not enough data</span></div>;
  const marked = mark !== undefined;
  const shown = marked ? mark : stats.median!;
  return (
    <div className={styles.rangeRow} data-marked={marked || undefined}>
      <span>{label}</span>
      <span className={styles.rangeTrack} aria-hidden="true">
        {hasBand && <span className={styles.rangeBand} style={{ left: at(stats.p10!), right: `calc(100% - ${at(stats.p90!)})` }} />}
        {hasBand && <span className={styles.rangeMedian} style={{ left: at(stats.median!) }} />}
        {marked && mark !== null && <span className={styles.rangeMark} style={{ left: at(mark) }} />}
      </span>
      <span className={styles.rangeValue}>
        {shown === null ? "–" : `${(shown * scale).toFixed(digits)} ${unit}`}
        <span className={styles.srOnly}>
          {marked ? `${markLabel ?? "this shot"}; ` : "median; "}
          {hasBand ? `middle 80% ${(stats.p10! * scale).toFixed(digits)} to ${(stats.p90! * scale).toFixed(digits)}, from ${stats.n} shots` : "no reliable shots to compare with"}
        </span>
      </span>
      <span className={styles.rangeN} aria-hidden="true">{marked ? "" : stats.n}</span>
    </div>
  );
}

/** A shared domain for one metric across both players (and an optional extra value). */
export function metricDomain(stats: Distribution[], scale: number, extra?: number | null): [number, number] {
  const lows = stats.map((s) => s.p10 ?? Infinity);
  const highs = stats.map((s) => s.p90 ?? -Infinity);
  if (extra !== undefined && extra !== null) { lows.push(extra); highs.push(extra); }
  const low = Math.min(...lows) * scale;
  const high = Math.max(...highs) * scale;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [0, 1];
  const pad = (high - low) * 0.08 || 1;
  return [low - pad, high + pad];
}

function PlayerProfiles({ match, analysis }: { match: Match; analysis: MatchAnalysis }) {
  const players = playerTools(match);
  const summaries = match.players.map((player) => analysis.players[player.id]);
  if (summaries.some((summary) => !summary)) return null;
  return (
    <section className={styles.section} aria-labelledby="profiles-heading">
      <div className={styles.sectionIntro}>
        <h3 id="profiles-heading">How each player hits</h3>
        <p>
          Bars span the middle 80% of each player’s shots, with the median marked. Built from the {analysis.quality.ok} of {analysis.quality.shots} shots measured
          reliably; the small number is the sample size.
        </p>
      </div>
      <div className={styles.profileGrid}>
        {match.players.map((player, index) => {
          const summary = summaries[index];
          return (
            <article key={player.id} className={styles.profile} data-tone={players.tone(player.id)}>
              <h4 data-tone={players.tone(player.id)}>{player.name}</h4>
              <p className={styles.points}>
                Won {summary.pointsWon} of {summary.pointsWithKnownWinner} points
                <span>{summary.pointsWonOnServe} of {summary.serves} on serve</span>
              </p>
              <div className={styles.ranges}>
                {METRICS.map(({ field, ...metric }) => (
                  <RangeRow {...metric} key={field} domain={metricDomain(summaries.map((s) => s[field]), metric.scale)} stats={summary[field]} />
                ))}
              </div>
              <figure className={styles.placementFigure}>
                <PlacementMap
                  placements={summary.placements}
                  tone={players.tone(player.id)}
                  label={`Where ${player.name}’s ${summary.placements.length} reliably measured shots ended, seen from their end of the court.`}
                />
                <figcaption>Where {players.shortName(player.id)}’s shots ended, seen from their end. Filled dots landed; open dots were returned.</figcaption>
              </figure>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const BAR = 7;
const GAP = 2;
const GAME_GAP = 22;
const CHART_HEIGHT = 120;
const CHART_TOP = 8;
const CHART_BOTTOM = CHART_TOP + CHART_HEIGHT;

/** One bar per rally, as tall as its shot count and coloured by who won the point. */
function RallyChart({ match, counts, current, onSelect }: {
  match: Match; counts: number[]; current: number; onSelect: (index: number) => void;
}) {
  const players = playerTools(match);
  const max = Math.max(10, ...counts);
  const step = max > 40 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step);
  const left = 34;
  const xs: number[] = [];
  const gameStarts: { game: number; x: number }[] = [];
  let x = left;
  match.rallies.forEach((rally, index) => {
    if (index > 0 && rally.game !== match.rallies[index - 1].game) x += GAME_GAP - GAP;
    if (index === 0 || rally.game !== match.rallies[index - 1].game) gameStarts.push({ game: rally.game, x });
    xs.push(x);
    x += BAR + GAP;
  });
  const width = x + 4;
  const y = (count: number) => CHART_BOTTOM - (count / max) * CHART_HEIGHT;
  return (
    <svg className={styles.rallyChart} viewBox={`0 0 ${width} ${CHART_BOTTOM + 34}`} role="img"
      aria-label={`Shots in each of the ${counts.length} rallies, coloured by who won the point. The longest had ${Math.max(...counts)} shots.`}>
      <g className={styles.heightGrid}>
        {ticks.map((tick) => <line key={tick} x1={left} x2={width} y1={y(tick)} y2={y(tick)} />)}
      </g>
      <g className={styles.axisText}>
        {ticks.map((tick) => <text key={tick} x={left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text>)}
      </g>
      <line className={styles.ground} x1={left} x2={width} y1={CHART_BOTTOM} y2={CHART_BOTTOM} />
      {match.rallies.map((rally, index) => (
        <rect key={rally.id} className={styles.bar} data-tone={players.tone(rally.winner)} data-current={index === current || undefined}
          x={xs[index]} y={y(counts[index]) - (counts[index] ? 0 : 1.5)} width={BAR} height={Math.max(1.5, CHART_BOTTOM - y(counts[index]))} rx={1.5}
          onClick={() => onSelect(index)}>
          <title>{`Rally ${index + 1}: ${counts[index]} shots${rally.winner ? `, point to ${players.shortName(rally.winner)}` : ""}`}</title>
        </rect>
      ))}
      {current >= 0 && <path className={styles.currentMark} d={`M${xs[current] + BAR / 2},${CHART_BOTTOM + 4}l5,7h-10z`} />}
      <g className={styles.viewText}>
        {gameStarts.map(({ game, x: gx }) => <text key={game} x={gx} y={CHART_BOTTOM + 28}>Game {game}</text>)}
      </g>
    </svg>
  );
}

/** Match zoom, under the video: rally lengths, games, and each player's shot profile. */
export function MatchOverview({ match, analysis, current, onSelectRally }: {
  match: Match; analysis?: MatchAnalysis; current: number; onSelectRally: (index: number) => void;
}) {
  const players = playerTools(match);
  const [a, b] = match.players;
  const counts = match.rallies.map((rally) => analysis?.rallies[rally.id]?.shots.length ?? 0);
  const games = gameSummaries(match, analysis);
  return (
    <>
      <section className={styles.section} aria-labelledby="rallies-heading">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIntro}>
            <h3 id="rallies-heading">Every rally</h3>
            <p>Bar height is the number of shots. Pick a rally to zoom in.</p>
          </div>
          <p className={styles.legend}>
            <span data-tone="a">Point to {players.shortName(a.id)}</span>
            <span data-tone="b">Point to {players.shortName(b.id)}</span>
          </p>
        </div>
        {analysis ? <div className={styles.chartScroll}><RallyChart match={match} counts={counts} current={current} onSelect={onSelectRally} /></div> : <p className={styles.detailEmpty}>Loading shot data…</p>}
      </section>
      <section className={styles.section} aria-labelledby="games-heading">
        <h3 id="games-heading" className={styles.srOnly}>Games</h3>
        <ol className={styles.games}>
          {games.map((game) => (
            <li key={game.game} className={styles.game}>
              <span className={styles.gameName}>Game {game.game}</span>
              <span className={styles.gameScore}>
                {game.final ? <><b data-tone="a">{game.final[a.id]}</b>–<b data-tone="b">{game.final[b.id]}</b></> : "–"}
              </span>
              <span className={styles.gameWinner}>{game.winner ? `${players.name(game.winner)} won` : game.final ? "In progress" : "Score unknown"}</span>
              <span className={styles.gameFacts}>
                {game.indices.length} rallies{game.averageShots !== null && `, ${game.averageShots.toFixed(1)} shots on average`}
              </span>
              {game.longest >= 0 && (
                <button type="button" className={styles.linkButton} onClick={() => onSelectRally(game.longest)}>
                  Longest: rally {game.longest + 1}, {counts[game.longest]} shots
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
      {analysis && <PlayerProfiles match={match} analysis={analysis} />}
    </>
  );
}

/** Match zoom, beside the video: every rally with its length and winner. */
export function MatchRail({ match, analysis, current, playing, ready, onSelectRally }: {
  match: Match; analysis?: MatchAnalysis; current: number; playing: boolean; ready: boolean; onSelectRally: (index: number) => void;
}) {
  const players = playerTools(match);
  const [a, b] = match.players;
  const listRef = useRef<HTMLDivElement>(null);
  const counts = match.rallies.map((rally) => analysis?.rallies[rally.id]?.shots.length ?? 0);
  const max = Math.max(1, ...counts);
  const games = gameSummaries(match);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>("[aria-current='true']");
    if (list && row && (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)) {
      list.scrollTo({ top: row.offsetTop - list.clientHeight / 3 });
    }
  }, [current]);
  return (
    <div className={styles.rail}>
      <div className={styles.matchColumns} aria-hidden="true"><span>#</span><span>Score</span><span>Shots</span><span>Point</span></div>
      <div ref={listRef} className={styles.shotScroll}>
        {games.map(({ game, indices }) => (
          <section key={game} aria-label={`Game ${game}`}>
            <h3 className={styles.railGame}>Game {game}</h3>
            <ol className={styles.shotList}>
              {indices.map((index) => {
                const rally = match.rallies[index];
                const selected = index === current;
                return (
                  <li key={rally.id}>
                    <button type="button" className={styles.matchRow} disabled={!ready} aria-current={selected ? "true" : undefined}
                      aria-label={`Rally ${index + 1}, ${rally.scoreBefore ? `score ${rally.scoreBefore[a.id]} to ${rally.scoreBefore[b.id]}` : "score unknown"}, ${analysis ? `${counts[index]} shots, ` : ""}${Math.round(rallySeconds(rally))} seconds${rally.winner ? `, point to ${players.name(rally.winner)}` : ""}. Zoom in.`}
                      onClick={() => onSelectRally(index)}>
                      <span className={styles.shotNumber}>{selected && playing ? <span className={styles.liveDot} aria-hidden="true" /> : index + 1}</span>
                      <span className={styles.railScore}>{rally.scoreBefore ? <><b data-tone="a">{rally.scoreBefore[a.id]}</b>–<b data-tone="b">{rally.scoreBefore[b.id]}</b></> : "–"}</span>
                      <span className={styles.shotBar} data-tone={players.tone(rally.winner)}>
                        <i style={{ width: `${(counts[index] / max) * 100}%` }} />
                        <span>{analysis ? counts[index] : ""}</span>
                      </span>
                      <span className={styles.shotPlayer} data-tone={players.tone(rally.winner)}>{rally.winner ? players.shortName(rally.winner) : "–"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
