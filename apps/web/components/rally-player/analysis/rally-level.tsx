"use client";

import type { Match, MatchAnalysis, Rally, Shot } from "../contract";
import { formatTime, rallySeconds } from "../timeline";
import { metricDomain, RangeRow } from "./match-level";
import { METRICS, playerTools, value } from "./players";
import { endLabel, kmh, netClearance, qualityNote } from "./shots";
import { bandPosition, rallySummary } from "./summary";
import styles from "./analysis.module.css";

/** Rally zoom, beside the drawing: how the point went. */
export function RallySummary({ match, rally, index, shots, onSelectShot }: {
  match: Match; rally: Rally; index: number; shots: readonly Shot[]; onSelectShot: (index: number) => void;
}) {
  const players = playerTools(match);
  const [a, b] = match.players;
  const summary = rallySummary(shots);
  const record = (shotIndex: number, text: string) => shotIndex < 0 ? "–" : (
    <button type="button" className={styles.linkButton} onClick={() => onSelectShot(shotIndex)}>
      {text}, {players.shortName(shots[shotIndex].hitter)}, shot {shotIndex + 1}
    </button>
  );
  return (
    <div className={styles.detail} aria-live="polite">
      <p className={styles.detailCount}>Rally {index + 1} of {match.rallies.length}</p>
      <h3 data-tone={players.tone(rally.winner)}>{rally.winner ? `Point to ${players.name(rally.winner)}` : "Winner not known"}</h3>
      <p className={styles.detailOutcome}>
        {!summary.last ? "No shots were reconstructed"
          : summary.last.hitter ? `Ended when ${players.shortName(summary.last.hitter)}’s shot ${endLabel(summary.last).toLowerCase()}`
          : `Ended on a net cord that ${endLabel(summary.last).toLowerCase()}`}
        {" "}<span>Game {rally.game}{rally.scoreBefore && `, ${rally.scoreBefore[a.id]}–${rally.scoreBefore[b.id]}`}</span>
      </p>
      <dl>
        <div><dt>Shots</dt><dd>{summary.shots}</dd></div>
        <div><dt>Length</dt><dd>{Math.round(rallySeconds(rally))} s</dd></div>
        {match.players.map((player) => <div key={player.id}><dt>Shots by {players.shortName(player.id)}</dt><dd>{summary.byPlayer[player.id] ?? 0}</dd></div>)}
        <div><dt>Fastest</dt><dd>{record(summary.fastest, `${value(kmh(shots[summary.fastest]?.speed ?? null))} km/h`)}</dd></div>
        <div><dt>Highest</dt><dd>{record(summary.highest, `${value(shots[summary.highest]?.apex, 1)} m`)}</dd></div>
      </dl>
      {summary.unreliable > 0 && <p className={styles.detailNote}>{summary.unreliable} of {summary.shots} shots weren’t measured reliably and are left out of the records.</p>}
      <p className={styles.zoomHint}>Pick a shot to zoom in.</p>
    </div>
  );
}

/** Shot zoom, beside the drawing: every measurement of one shot. */
export function ShotDetail({ match, shot, index, count, onStep }: {
  match: Match; shot?: Shot; index: number; count: number; onStep: (index: number) => void;
}) {
  const players = playerTools(match);
  if (!shot) return <div className={styles.detail}><p className={styles.detailEmpty}>No shots were reconstructed for this rally.</p></div>;
  const note = qualityNote(shot);
  const unreliable = shot.quality === "unreliable";
  const rows: [string, string][] = unreliable ? [] : [
    ["Launch speed", `${value(kmh(shot.speed))} km/h`],
    ["Arrival speed", `${value(kmh(shot.arrivalSpeed))} km/h`],
    ["Flight time", `${(shot.endSeconds - shot.startSeconds).toFixed(2)} s`],
    ["Contact height", `${value(shot.contact[2], 2)} m`],
    ["Highest point", `${value(shot.apex, 2)} m`],
    ["Over the net", shot.netClearance === null ? "Didn’t cross" : netClearance(shot) === null ? "Uncertain" : `${value(netClearance(shot), 0, 100)} cm`],
    ["Launch angle", `${value(shot.launchAngle)}°`],
    ["Descent angle", `${value(shot.descentAngle)}°`],
  ];
  return (
    <div className={styles.detail} aria-live="polite">
      <div className={styles.stepper}>
        <button type="button" className={styles.navButton} disabled={index <= 0} aria-label="Previous shot" onClick={() => onStep(index - 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <p className={styles.detailCount}>Shot {index + 1} of {count}</p>
        <button type="button" className={styles.navButton} disabled={index >= count - 1} aria-label="Next shot" onClick={() => onStep(index + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
      <h3 data-tone={players.tone(shot.hitter)}>{players.name(shot.hitter)}</h3>
      <p className={styles.detailOutcome}>
        {endLabel(shot)} <span>{formatTime(shot.startSeconds)}, from the {shot.hitterEnd === "near" ? "camera" : "far"} end</span>
      </p>
      {rows.length > 0 && <dl>{rows.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>}
      {note && <p className={styles.detailNote}>{note}</p>}
    </div>
  );
}

const POSITION_TEXT = { above: "Above their usual range", below: "Below their usual range", within: "Within their usual range" } as const;

/** Shot zoom, below: this shot against the hitter's match. */
export function ShotComparison({ match, analysis, shot }: { match: Match; analysis?: MatchAnalysis; shot?: Shot }) {
  const players = playerTools(match);
  const profile = shot?.hitter ? analysis?.players[shot.hitter] : undefined;
  if (!shot || !profile || !analysis) return null;
  const unreliable = shot.quality === "unreliable";
  const values = { speed: shot.speed, apex: shot.apex, netClearance: netClearance(shot), contactHeight: shot.contact[2] };
  const all = match.players.map((player) => analysis.players[player.id]).filter(Boolean);
  return (
    <section className={styles.section} aria-labelledby="comparison-heading" data-tone={players.tone(shot.hitter)}>
      <div className={styles.sectionIntro}>
        <h3 id="comparison-heading">Against {players.name(shot.hitter)}’s match</h3>
        <p>
          {unreliable
            ? "This shot wasn’t measured reliably, so it isn’t compared."
            : <>The line is this shot. The band is the middle 80% of {players.shortName(shot.hitter)}’s {profile.okShots} reliably measured shots, with the median marked.</>}
        </p>
      </div>
      {!unreliable && (
        <div className={styles.comparison}>
          {METRICS.map(({ field, ...metric }) => {
            const mark = values[field];
            const position = bandPosition(mark, profile[field]);
            return (
              <div key={field} className={styles.comparisonRow}>
                <RangeRow {...metric} domain={metricDomain(all.map((s) => s[field]), metric.scale, mark)} stats={profile[field]} mark={mark} />
                <span className={styles.position}>{position ? POSITION_TEXT[position] : ""}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
