"use client";

import type { Match, MatchAnalysis, Rally, RallyRecords, ReplyTally, Shot, ShotTypeName } from "../contract";
import { formatTime, rallySeconds } from "../timeline";
import { metricDomain, RangeRow } from "./match-level";
import { METRICS, playerTools, value } from "./players";
import { MIN_PATTERN_SAMPLE, MIN_TYPE_SAMPLE, plural, tendency, withArticle } from "./patterns";
import { correctionNote, percent, SHOT_TYPE_NAMES, shotNoun, shotTypeConfidence, shotTypeView } from "./shot-types";
import { endLabel, kmh, netClearance, qualityNote } from "./shots";
import { bandPosition } from "./summary";
import styles from "./analysis.module.css";

/** Rally zoom, beside the drawing: how the point went. */
export function RallySummary({ match, rally, index, shots, records, onSelectShot }: {
  match: Match; rally: Rally; index: number; shots: readonly Shot[]; records?: RallyRecords; onSelectShot: (index: number) => void;
}) {
  const players = playerTools(match);
  const [a, b] = match.players;
  const summary = { shots: 0, unreliable: 0, byPlayer: {} as Record<string, number>, fastest: null, highest: null, ...records, last: shots.at(-1) };
  const record = (shotIndex: number | null, text: string) => shotIndex === null ? "–" : (
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
          : summary.last.hitter ? `Ended when ${players.shortName(summary.last.hitter)}’s ${shotNoun(summary.last)} ${endLabel(summary.last).toLowerCase()}`
          : `Ended on a net cord that ${endLabel(summary.last).toLowerCase()}`}
        {" "}<span>Game {rally.game}{rally.scoreBefore && `, ${rally.scoreBefore[a.id]}–${rally.scoreBefore[b.id]}`}</span>
      </p>
      <dl>
        <div><dt>Shots</dt><dd>{summary.shots}</dd></div>
        <div><dt>Length</dt><dd>{Math.round(rallySeconds(rally))} s</dd></div>
        {match.players.map((player) => <div key={player.id}><dt>Shots by {players.shortName(player.id)}</dt><dd>{summary.byPlayer[player.id] ?? 0}</dd></div>)}
        <div><dt>Fastest</dt><dd>{record(summary.fastest, `${value(kmh(summary.fastest === null ? null : shots[summary.fastest].speed))} km/h`)}</dd></div>
        <div><dt>Highest</dt><dd>{record(summary.highest, `${value(summary.highest === null ? null : shots[summary.highest].apex, 1)} m`)}</dd></div>
      </dl>
      {summary.unreliable > 0 && <p className={styles.detailNote}>{summary.unreliable} of {summary.shots} shots weren’t measured reliably and are left out of the records.</p>}
      <p className={styles.zoomHint}>Pick a shot to replay it in 3D.</p>
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
  const type = shotTypeView(shot);
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
      {type && (
        <p className={styles.shotTypeLine} data-confident={type.confident || undefined}>
          {type.confident ? type.label : type.name ? `${type.label}?` : "Stroke type unclear"}
          <span title="Inferred by a model from the players’ poses and the shuttle’s track; not checked by hand">{shotTypeConfidence(shot)}</span>
        </p>
      )}
      <p className={styles.detailOutcome}>
        {endLabel(shot)} <span>{formatTime(shot.startSeconds)}, from the {shot.hitterEnd === "near" ? "camera" : "far"} end</span>
      </p>
      {rows.length > 0 && <dl>{rows.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>}
      {correctionNote(shot) && <p className={styles.detailNote}>{correctionNote(shot)}</p>}
      {note && <p className={styles.detailNote}>{note}</p>}
    </div>
  );
}

const POSITION_TEXT = { above: "Above their usual range", below: "Below their usual range", within: "Within their usual range" } as const;

/** Rally zoom, below the drawing: every shot in order, as the model typed it, ending with how the point finished. */
export function RallySequence({ match, rally, shots, activeIndex, onSelectShot }: {
  match: Match; rally: Rally; shots: readonly Shot[]; activeIndex: number; onSelectShot: (index: number) => void;
}) {
  const players = playerTools(match);
  if (!shots.some((shot) => shot.shotType)) return null;
  const last = shots.at(-1);
  return (
    <section className={styles.section} aria-labelledby="sequence-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIntro}>
          <h3 id="sequence-heading">Shot by shot</h3>
          <p>The rally as a sequence of stroke types, inferred by a model and not checked by hand; a question mark is a low-confidence guess. Pick a shot to see it on the court.</p>
        </div>
        <p className={styles.legend}>
          {match.players.map((player) => <span key={player.id} data-tone={players.tone(player.id)}>{players.shortName(player.id)}</span>)}
        </p>
      </div>
      <ol className={styles.sequence}>
        {shots.map((shot, index) => {
          const type = shotTypeView(shot);
          const text = !shot.hitter ? "Net cord" : !type ? "Shot" : type.name ? `${type.short}${type.confident ? "" : "?"}` : "Unclear";
          return (
            <li key={index}>
              <button type="button" className={styles.sequenceShot} data-tone={players.tone(shot.hitter)} data-confident={!shot.hitter || type?.confident || undefined}
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={`Shot ${index + 1}, ${players.name(shot.hitter)}, ${type?.name ? `${type.confident ? "" : "possibly "}${type.label.toLowerCase()}` : "type unclear"}`}
                onClick={() => onSelectShot(index)}>
                <span className={styles.sequenceNumber}>{index + 1}</span>{text}
              </button>
            </li>
          );
        })}
        {last && (
          <li className={styles.sequenceEnd} data-tone={players.tone(rally.winner)}>
            {endLabel(last) === "Returned" ? "Rally ended" : endLabel(last)}{rally.winner ? ` · point to ${players.shortName(rally.winner)}` : ""}
          </li>
        )}
      </ol>
    </section>
  );
}


/** Top replies as bars; the row this rally actually took is marked. */
function PatternBars({ result, actual }: { result: ReplyTally; actual: ShotTypeName | null }) {
  return (
    <ul className={styles.patternBars}>
      {result.replies.slice(0, 4).map((entry) => (
        <li key={entry.type} data-this={entry.type === actual || undefined}>
          <span>{SHOT_TYPE_NAMES[entry.type].label}{entry.type === actual && <span className={styles.srOnly}> (this time)</span>}</span>
          <span className={styles.mixBar} aria-hidden="true"><i style={{ width: `${(entry.count / result.n) * 100}%` }} /></span>
          <span className={styles.mixValue}>{percent(entry.count / result.n)}</span>
          <span className={styles.rangeN}>{entry.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Shot zoom, below: this shot against the hitter's similar shots, and the patterns around it. */
export function ShotComparison({ match, analysis, shots, index }: { match: Match; analysis?: MatchAnalysis; shots: readonly Shot[]; index: number }) {
  const players = playerTools(match);
  const shot = shots[index];
  const profile = shot?.hitter ? analysis?.players[shot.hitter] : undefined;
  if (!shot?.hitter || !profile || !analysis) return null;
  const hitter = shot.hitter;
  const opponent = match.players.find((player) => player.id !== hitter)!.id;
  const name = players.shortName(hitter);
  const other = players.shortName(opponent);
  const type = shotTypeView(shot);
  const typeName = type?.confident ? type.name : null;

  // Like with like: the hitter's other shots of this type, when there are enough of them.
  const byType = (player: string) => typeName ? analysis.players[player]?.shotTypes?.byType[typeName] : undefined;
  const sameType = byType(hitter);
  const useType = sameType !== undefined && sameType.okShots >= MIN_TYPE_SAMPLE;
  const stats = useType ? sameType : profile;
  const all = match.players.map((player) => useType ? byType(player.id) : analysis.players[player.id]).filter((s) => s !== undefined);
  const unreliable = shot.quality === "unreliable";
  const values = { speed: shot.speed, apex: shot.apex, netClearance: netClearance(shot), contactHeight: shot.contact[2] };
  const group = useType ? `${plural(typeName!)}` : "shots";

  // Patterns: what the hitter does facing the previous shot, what the opponent does next, how this type ends rallies.
  const previous = index > 0 ? shots[index - 1] : undefined;
  const previousType = previous?.hitter === opponent && shotTypeView(previous)?.confident ? previous.shotType!.name : null;
  const next = shots[index + 1];
  const nextType = next?.hitter === opponent ? next.shotType?.name ?? null : null;
  const before = previousType ? analysis.patterns?.responses[hitter]?.[previousType] : undefined;
  const after = typeName ? analysis.patterns?.followUps[hitter]?.[typeName] : undefined;
  const ends = sameType;
  const beforeLine = before ? tendency(before, "answers with") : null;
  const thisTime = type?.name ? `${type.label.toLowerCase()}${type.confident ? "" : "?"}` : "type unclear";
  const afterLine = after ? tendency(after, "replies with") : null;

  return (
    <section className={styles.section} aria-labelledby="comparison-heading" data-tone={players.tone(hitter)}>
      <div className={styles.sectionIntro}>
        <h3 id="comparison-heading">{useType ? `Against ${players.name(hitter)}’s other ${group}` : `Against ${players.name(hitter)}’s match`}</h3>
        <p>
          {unreliable
            ? "This shot wasn’t measured reliably, so its numbers aren’t compared."
            : <>The line is this shot. The band is the middle 80% of {name}’s {stats.okShots} reliably measured {group}, with the median marked.
              {typeName && !useType && ` Too few of ${name}’s ${plural(typeName)} were measured reliably to compare like with like.`}</>}
        </p>
      </div>
      {!unreliable && (
        <div className={styles.comparison}>
          {METRICS.map(({ field, ...metric }) => {
            const mark = values[field];
            const position = bandPosition(mark, stats[field]);
            return (
              <div key={field} className={styles.comparisonRow}>
                <RangeRow {...metric} domain={metricDomain(all.map((s) => s[field]), metric.scale, mark)} stats={stats[field]} mark={mark} />
                <span className={styles.position}>{position ? POSITION_TEXT[position] : ""}</span>
              </div>
            );
          })}
        </div>
      )}
      {(beforeLine || afterLine || (ends && ends.count >= MIN_PATTERN_SAMPLE)) && (
        <div className={styles.patterns}>
          {beforeLine && before && previousType && (
            <article className={styles.pattern}>
              <h4>Before this shot</h4>
              <p>When {other} plays {withArticle(previousType)}, {name} {beforeLine}. This time: {thisTime}.</p>
              <PatternBars result={before} actual={shot.shotType?.name ?? null} />
            </article>
          )}
          {afterLine && after && typeName && (
            <article className={styles.pattern} data-tone={players.tone(opponent)}>
              <h4>After it</h4>
              <p>After {name}’s {plural(typeName)}, {other} {afterLine}. This time: {next?.hitter === opponent ? (nextType ? SHOT_TYPE_NAMES[nextType].label.toLowerCase() : "type unclear") : "the rally ended"}.</p>
              <PatternBars result={after} actual={nextType} />
            </article>
          )}
          {ends && typeName && ends.count >= MIN_PATTERN_SAMPLE && (
            <article className={styles.pattern}>
              <h4>As a finisher</h4>
              <p>
                {ends.endedRally} of {name}’s {ends.count} {plural(typeName)} ({percent(ends.endedRally / ends.count)}) ended the rally
                {ends.endedRallyKnownWinner > 0 ? `; ${name} won ${ends.endedRallyWon} of those ${ends.endedRallyKnownWinner} points.` : "."}
              </p>
            </article>
          )}
          <p className={styles.patternNote}>From this match only, using the model’s stroke types. Patterns need at least {MIN_PATTERN_SAMPLE} occurrences.</p>
        </div>
      )}
    </section>
  );
}
