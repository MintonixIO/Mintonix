"use client";

import { useState, type KeyboardEvent } from "react";
import type { Match, MatchAnalysis } from "../contract";
import { playerTools } from "./players";
import {
  contactSeenFromHitter, DEPTHS, exploreShots, HIT_ZONES, SIDES, ZONE_LABELS,
  type ExploredShot, type ExplorerFilter, type HitZone, type ShotOutcome,
} from "./shot-explorer";
import { plural } from "./patterns";
import { hasShotTypes, SHOT_TYPE_NAMES } from "./shot-types";
import { COURT, formatShotParam, kmh, type ShotRef } from "./shots";
import styles from "./analysis.module.css";

/** Start on the first player's smashes, the shot people most often want to look at. */
export function defaultExplorerFilter(match: Match, analysis?: MatchAnalysis): ExplorerFilter {
  return { player: match.players[0].id, type: hasShotTypes(analysis) ? "smash" : "all", zone: "all" };
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const OUTCOME_LABELS:Record<ShotOutcome, string> = { winner: "Winner", error: "Error", returned: "Returned", unknown: "Point unknown" };

// Court drawing, seen from above with the hitter at the right (camera) end, as in the placement maps.
const M = 0.5;
const K = 36;
const X = (y: number) => (y + M) * K;
const Y = (x: number) => (COURT.width + M - x) * K;
const THIRD = (COURT.length - COURT.netY) / 3;

function zoneRect(zone: HitZone) {
  const [depth, side] = zone.split("-") as [(typeof DEPTHS)[number], (typeof SIDES)[number]];
  const from = COURT.netY + DEPTHS.indexOf(depth) * THIRD;
  // From the hitter's view their left is x = 0, drawn at the bottom.
  const [x0, x1] = side === "left" ? [0, COURT.width / 2] : [COURT.width / 2, COURT.width];
  return { x: X(from), y: Y(x1), width: THIRD * K, height: (x1 - x0) * K };
}

const activate = (run: () => void) => (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    run();
  }
};

function Mark({ shot, outcome }: { shot: ExploredShot["shot"]; outcome: ShotOutcome }) {
  const [px, py] = shot.placement;
  const cx = X(py);
  const cy = Y(px);
  if (outcome === "error") return <path className={styles.exploreError} d={`M${cx - 4},${cy - 4}l8,8m0,-8l-8,8`} />;
  if (outcome === "winner") return <circle className={styles.exploreWinner} cx={cx} cy={cy} r={4.5} />;
  return <circle className={styles.exploreReturned} data-outcome={outcome} cx={cx} cy={cy} r={outcome === "unknown" ? 2.5 : 3.5} />;
}

/** Pick a player, a stroke type and where it was hit from; see where every such shot went and open any of them. */
export function ShotExplorer({ match, analysis, filter, onFilter, onOpenShot }: {
  match: Match;
  analysis: MatchAnalysis;
  filter: ExplorerFilter;
  onFilter: (filter: ExplorerFilter) => void;
  onOpenShot: (ref: ShotRef) => void;
}) {
  const players = playerTools(match);
  const [hovered, setHovered] = useState<string | null>(null);
  const result = exploreShots(match, analysis, filter);
  const typed = hasShotTypes(analysis);
  const order = analysis.shotTypes?.order ?? [];
  const tone = players.tone(filter.player);
  const name = players.shortName(filter.player);
  const what = filter.type === "all" ? "shots" : plural(filter.type);
  const one = filter.type === "all" ? "shot" : SHOT_TYPE_NAMES[filter.type].label.toLowerCase();
  const where = filter.zone === "all" ? "" : ` from the ${ZONE_LABELS[filter.zone]}`;
  const { tally, leftOut } = result;
  const describe = (s: ExploredShot) => {
    const score = s.rally.scoreBefore ? `, ${s.rally.scoreBefore[match.players[0].id]}–${s.rally.scoreBefore[match.players[1].id]}` : "";
    const speed = kmh(s.shot.speed);
    return `Rally ${s.rallyIndex + 1}, shot ${s.ref.index + 1}${score}: ${OUTCOME_LABELS[s.outcome].toLowerCase()}${speed ? `, ${speed} km/h` : ""}`;
  };
  const hoveredShot = hovered ? result.shots.find((s) => formatShotParam(s.ref) === hovered) : undefined;
  // Draw the hovered shot last so it sits on top.
  const drawn = hoveredShot ? [...result.shots.filter((s) => s !== hoveredShot), hoveredShot] : result.shots;
  const setZone = (zone: HitZone) => onFilter({ ...filter, zone: filter.zone === zone ? "all" : zone });

  return (
    <section className={styles.section} aria-labelledby="explorer-heading">
      <div className={styles.sectionIntro}>
        <h3 id="explorer-heading">Shot explorer</h3>
        <p>
          Pick a player and a stroke, then click a zone on their side of the court to see only shots hit from there. Every mark is where
          one of those shots ended; open any of them to watch it.
        </p>
      </div>

      <div className={styles.exploreControls}>
        <div className={styles.segmented} role="group" aria-label="Player">
          {match.players.map((player) => (
            <button key={player.id} type="button" data-tone={players.tone(player.id)} aria-pressed={filter.player === player.id}
              onClick={() => onFilter({ ...filter, player: player.id })}>
              <span className={styles.exploreDot} aria-hidden="true" />{players.shortName(player.id)}
            </button>
          ))}
        </div>
        {typed && (
          <div className={styles.exploreTypes} role="group" aria-label="Stroke type">
            <button type="button" aria-pressed={filter.type === "all"} onClick={() => onFilter({ ...filter, type: "all" })}>All strokes</button>
            {order.map((type) => {
              const count = result.typeCounts[type] ?? 0;
              const selected = filter.type === type;
              return (
                <button key={type} type="button" aria-pressed={selected} disabled={!count && !selected} onClick={() => onFilter({ ...filter, type })}>
                  {SHOT_TYPE_NAMES[type].short} <span>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.exploreBody} data-tone={tone}>
        <figure className={styles.exploreFigure}>
          <svg className={styles.exploreCourt} viewBox={`0 0 ${(COURT.length + 2 * M) * K} ${(COURT.width + 2 * M) * K}`} role="group"
            aria-label={`Court seen from above with ${name} at the right-hand end. Their half is split into six zones to filter by; marks on the left show where the ${result.shots.length} matching shots ended.`}>
            <rect className={styles.courtSurface} x={X(0)} y={Y(COURT.width)} width={COURT.length * K} height={COURT.width * K} />
            {HIT_ZONES.map((zone) => {
              const rect = zoneRect(zone);
              const count = result.zoneCounts[zone];
              return (
                <g key={zone} className={styles.exploreZone} role="button" tabIndex={0} aria-pressed={filter.zone === zone}
                  aria-label={`Hit from the ${ZONE_LABELS[zone]}: ${count} shots`}
                  onClick={() => setZone(zone)} onKeyDown={activate(() => setZone(zone))}>
                  <rect {...rect} />
                  <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 5} textAnchor="middle">{count}</text>
                </g>
              );
            })}
            <g className={styles.courtLines} pointerEvents="none">
              {[0, COURT.singlesInset, COURT.width - COURT.singlesInset, COURT.width].map((x) => <line key={x} x1={X(0)} x2={X(COURT.length)} y1={Y(x)} y2={Y(x)} />)}
              {[0, COURT.doublesLongService, COURT.netY - COURT.shortService, COURT.netY + COURT.shortService, COURT.length - COURT.doublesLongService, COURT.length]
                .map((y) => <line key={y} x1={X(y)} x2={X(y)} y1={Y(0)} y2={Y(COURT.width)} />)}
              <line x1={X(0)} x2={X(COURT.netY - COURT.shortService)} y1={Y(COURT.width / 2)} y2={Y(COURT.width / 2)} />
              <line x1={X(COURT.netY + COURT.shortService)} x2={X(COURT.length)} y1={Y(COURT.width / 2)} y2={Y(COURT.width / 2)} />
            </g>
            <line className={styles.net} x1={X(COURT.netY)} x2={X(COURT.netY)} y1={Y(-0.2)} y2={Y(COURT.width + 0.2)} />
            {hoveredShot && (() => {
              const [cx, cy] = contactSeenFromHitter(hoveredShot.shot);
              const [px, py] = hoveredShot.shot.placement;
              return (
                <g className={styles.exploreFlight} aria-hidden="true">
                  <line x1={X(cy)} y1={Y(cx)} x2={X(py)} y2={Y(px)} />
                  <circle cx={X(cy)} cy={Y(cx)} r={3.5} />
                </g>
              );
            })()}
            <g className={styles.exploreMarks}>
              {drawn.map((s) => {
                const key = formatShotParam(s.ref);
                const [px, py] = s.shot.placement;
                return (
                  <g key={key} role="button" tabIndex={0} data-explorer-shot={key} data-hovered={key === hovered || undefined}
                    aria-label={`${describe(s)}. Open this shot.`}
                    onClick={() => onOpenShot(s.ref)} onKeyDown={activate(() => onOpenShot(s.ref))}
                    onPointerEnter={() => setHovered(key)} onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(key)} onBlur={() => setHovered(null)}>
                    <title>{describe(s)}</title>
                    <circle className={styles.exploreHit} cx={X(py)} cy={Y(px)} r={6} />
                    <Mark shot={s.shot} outcome={s.outcome} />
                  </g>
                );
              })}
            </g>
            <g className={styles.viewText}>
              <text x={X(COURT.length)} y={Y(COURT.width) - 6} textAnchor="end">{name} hits from here</text>
              <text x={X(0)} y={Y(COURT.width) - 6}>Where it went</text>
            </g>
          </svg>
          <figcaption className={styles.exploreLegend}>
            <span data-outcome="winner">Winner</span>
            <span data-outcome="error">Error</span>
            <span data-outcome="returned">Returned</span>
            {filter.zone !== "all" && (
              <button type="button" className={styles.linkButton} onClick={() => onFilter({ ...filter, zone: "all" })}>Show every zone</button>
            )}
          </figcaption>
        </figure>

        <div className={styles.exploreSide}>
          <p className={styles.exploreTally} aria-live="polite">
            <strong>{tally.shots} {tally.shots === 1 ? one : what}</strong> by {name}{where}
            <span>
              {count(tally.winners, "winner")} · {count(tally.errors, "error")} · {tally.returned} returned
              {tally.medianKmh !== null && ` · median ${tally.medianKmh} km/h`}
            </span>
          </p>
          {(leftOut.unreliable > 0 || leftOut.uncertainType > 0) && (
            <p className={styles.exploreNote}>
              Not shown:{leftOut.uncertainType > 0 && ` ${leftOut.uncertainType} the model wasn’t sure were ${what}`}
              {leftOut.uncertainType > 0 && leftOut.unreliable > 0 && ";"}
              {leftOut.unreliable > 0 && ` ${leftOut.unreliable} whose flight wasn’t measured reliably`}.
            </p>
          )}
          {result.shots.length === 0 ? (
            <p className={styles.detailEmpty}>No shots match. Try another zone or stroke.</p>
          ) : (
            <ol className={styles.exploreList} aria-label="Matching shots">
              {result.shots.map((s) => {
                const key = formatShotParam(s.ref);
                const speed = kmh(s.shot.speed);
                return (
                  <li key={key}>
                    <button type="button" data-hovered={key === hovered || undefined} data-outcome={s.outcome}
                      aria-label={`${describe(s)}. Open this shot.`}
                      onClick={() => onOpenShot(s.ref)} onPointerEnter={() => setHovered(key)} onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(key)} onBlur={() => setHovered(null)}>
                      <span>Rally {s.rallyIndex + 1}</span>
                      <span>{s.rally.scoreBefore ? `${s.rally.scoreBefore[match.players[0].id]}–${s.rally.scoreBefore[match.players[1].id]}` : "–"}</span>
                      <span className={styles.exploreOutcome}>{OUTCOME_LABELS[s.outcome]}</span>
                      <span>{speed ? `${speed} km/h` : "–"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
