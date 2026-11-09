"use client";

import { useEffect, useRef, useState } from "react";
import type { Match, MatchAnalysis, Rally, Shot } from "../contract";
import { formatTime, rallySeconds } from "../timeline";
import { CourtDrawing } from "./court-drawing";
import { MatchOverview } from "./match-level";
import { playerTools, value } from "./players";
import { RallySummary, ShotComparison, ShotDetail } from "./rally-level";
import { endLabel, kmh, netClearance, qualityNote } from "./shots";
import type { Zoom } from "./summary";
import styles from "./analysis.module.css";

/** Fetch shot data once, when the analyze view first opens. */
export function useAnalysis(matchId: string, enabled: boolean) {
  const [state, setState] = useState<{ analysis?: MatchAnalysis; error?: string }>({});
  const requested = useRef(false);
  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    fetch(`/api/matches/${encodeURIComponent(matchId)}/analysis`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Shot data failed to load (${response.status}).`);
        setState({ analysis: await response.json() as MatchAnalysis });
      })
      .catch((error: Error) => {
        requested.current = false;
        setState({ error: error.message });
      });
  }, [matchId, enabled]);
  return state;
}

/**
 * Match › Rally › Shot. Each step is a zoom level; the current one is filled and the
 * steps past it show where zooming in would go (the rally and shot under the playhead).
 */
export function ZoomTrail({ zoom, rallyLabel, shotLabel, onZoom }: {
  zoom: Zoom; rallyLabel: string; shotLabel: string | null; onZoom: (zoom: Zoom) => void;
}) {
  const steps: { zoom: Zoom; label: string; disabled?: boolean }[] = [
    { zoom: "match", label: "Match" },
    { zoom: "rally", label: rallyLabel },
    { zoom: "shot", label: shotLabel ?? "Shot", disabled: !shotLabel },
  ];
  const depth = steps.findIndex((step) => step.zoom === zoom);
  return (
    <nav className={styles.zoomTrail} aria-label="Zoom">
      <ol>
        {steps.map((step, index) => (
          <li key={step.zoom} data-past={index > depth || undefined}>
            <button type="button" aria-current={index === depth ? "step" : undefined} disabled={step.disabled}
              title={index < depth ? `Zoom out to ${step.zoom}` : index > depth ? `Zoom in to ${step.zoom}` : undefined}
              onClick={() => onZoom(step.zoom)}>
              {step.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Rally and shot zoom, beside the video: the rally's shots. */
export function ShotRail({ match, rally, rallyIndex, shots, activeIndex, playing, ready, onSelectShot, onPrevious, onNext, loading, error }: {
  match: Match;
  rally: Rally;
  rallyIndex: number;
  shots: readonly Shot[];
  activeIndex: number;
  playing: boolean;
  ready: boolean;
  onSelectShot: (index: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  loading: boolean;
  error?: string;
}) {
  const players = playerTools(match);
  const listRef = useRef<HTMLOListElement>(null);
  const [a, b] = match.players;
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>("[aria-current='true']");
    const list = listRef.current?.parentElement;
    if (!row || !list) return;
    if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: row.offsetTop - list.clientHeight / 3, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, [activeIndex, rally.id]);
  return (
    <div className={styles.rail}>
      <div className={styles.railHeader}>
        <div className={styles.rallyNav}>
          <button type="button" className={styles.navButton} disabled={!ready || !onPrevious} aria-label="Previous rally" onClick={onPrevious}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <h2>Rally {rallyIndex + 1} <span>of {match.rallies.length}</span></h2>
          <button type="button" className={styles.navButton} disabled={!ready || !onNext} aria-label="Next rally" onClick={onNext}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
        <p className={styles.rallyFacts}>
          <span>Game {rally.game}</span>
          {rally.scoreBefore && <span className={styles.railScore}><b data-tone="a">{rally.scoreBefore[a.id]}</b>–<b data-tone="b">{rally.scoreBefore[b.id]}</b></span>}
          <span>{Math.round(rallySeconds(rally))} s</span>
          {rally.winner && <span>Point to {players.shortName(rally.winner)}</span>}
        </p>
      </div>
      <div className={styles.shotColumns} aria-hidden="true"><span>#</span><span>Player</span><span>km/h</span><span>Height</span><span>Over net</span></div>
      <div className={styles.shotScroll}>
        {loading && <p className={styles.railMessage} role="status">Loading shot data…</p>}
        {error && <p className={styles.railMessage} role="alert">{error}</p>}
        {!loading && !error && shots.length === 0 && <p className={styles.railMessage}>No shots were reconstructed for this rally.</p>}
        <ol ref={listRef} className={styles.shotList}>
          {shots.map((shot, index) => {
            const unreliable = shot.quality === "unreliable";
            const approx = shot.quality === "guessed" ? "≈" : "";
            const selected = index === activeIndex;
            return (
              <li key={`${rally.id}-${index}`}>
                <button
                  type="button"
                  className={styles.shotRow}
                  disabled={!ready}
                  aria-current={selected ? "true" : undefined}
                  data-quality={shot.quality}
                  title={qualityNote(shot) ?? undefined}
                  aria-label={`Shot ${index + 1} by ${players.name(shot.hitter)}${unreliable ? ", not measured reliably" : `, ${kmh(shot.speed) ?? "unknown"} km/h`}, at ${formatTime(shot.startSeconds)}`}
                  onClick={() => onSelectShot(index)}
                >
                  <span className={styles.shotNumber}>{selected && playing ? <span className={styles.liveDot} aria-hidden="true" /> : index + 1}</span>
                  <span className={styles.shotPlayer} data-tone={players.tone(shot.hitter)}>{players.shortName(shot.hitter)}</span>
                  <span>{unreliable ? "–" : `${approx}${value(kmh(shot.speed))}`}</span>
                  <span>{unreliable ? "–" : `${approx}${value(shot.apex, 1)} m`}</span>
                  <span>{unreliable || netClearance(shot) === null ? "–" : `${approx}${value(netClearance(shot), 0, 100)} cm`}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Everything under the video in analyze view, at the current zoom. */
export function AnalysisDeck({ zoom, match, analysis, rally, rallyIndex, shots, activeIndex, time, onSelectRally, onSelectShot }: {
  zoom: Zoom;
  match: Match;
  analysis?: MatchAnalysis;
  rally: Rally;
  rallyIndex: number;
  shots: readonly Shot[];
  activeIndex: number;
  time: number;
  onSelectRally: (index: number) => void;
  onSelectShot: (index: number) => void;
}) {
  const players = playerTools(match);
  const heading = zoom === "match" ? "The match" : zoom === "rally" ? `Rally ${rallyIndex + 1}` : `Shot ${activeIndex + 1} of rally ${rallyIndex + 1}`;
  return (
    <div className={styles.deck} data-zoom={zoom}>
      <h2 className={styles.srOnly}>{heading}</h2>
      {zoom === "match" ? (
        <MatchOverview match={match} analysis={analysis} current={rallyIndex} onSelectRally={onSelectRally} />
      ) : (
        <>
          <div className={styles.flight}>
            <CourtDrawing
              shots={shots}
              activeIndex={activeIndex}
              time={time}
              only={zoom === "shot"}
              tone={(shot) => players.tone(shot.hitter)}
              onSelect={onSelectShot}
              describe={(shot) => `${players.name(shot.hitter)}, ${endLabel(shot).toLowerCase()}`}
            />
            {zoom === "rally"
              ? <RallySummary match={match} rally={rally} index={rallyIndex} shots={shots} onSelectShot={onSelectShot} />
              : <ShotDetail match={match} shot={shots[activeIndex]} index={activeIndex} count={shots.length} onStep={onSelectShot} />}
          </div>
          {zoom === "shot" && <ShotComparison match={match} analysis={analysis} shot={shots[activeIndex]} />}
        </>
      )}
      <p className={styles.deckNotice}>
        Shot data is reconstructed automatically from the broadcast and hasn’t been checked by hand. Shot types, shot sequences and
        serve-and-return patterns are planned.
      </p>
    </div>
  );
}
