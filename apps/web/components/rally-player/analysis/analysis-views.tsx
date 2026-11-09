"use client";

import { useEffect, useRef, useState } from "react";
import type { Match, MatchAnalysis, Rally, Shot } from "../contract";
import { CourtDrawing } from "./court-drawing";
import { MatchOverview } from "./match-level";
import { playerTools } from "./players";
import { RallySummary, ShotComparison, ShotDetail } from "./rally-level";
import { endLabel } from "./shots";
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

/** Everything under the video in analyze view: one open shot, a rally, or the whole match. */
export function AnalysisDeck({ deck, openShot, match, analysis, rally, rallyIndex, shots, activeIndex, time, onSelectRally, onSelectShot }: {
  deck: "match" | "rally";
  openShot: { shot: Shot; index: number } | null;
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
  const heading = openShot ? `Shot ${openShot.index + 1} of rally ${rallyIndex + 1}` : deck === "rally" ? `Rally ${rallyIndex + 1}` : "The match";
  return (
    <div className={styles.deck} data-deck={openShot ? "shot" : deck}>
      <h2 className={styles.srOnly}>{heading}</h2>
      {openShot ? (
        <>
          <div className={styles.shotDeck}>
            <ShotDetail match={match} shot={openShot.shot} index={openShot.index} count={shots.length} onStep={onSelectShot} />
          </div>
          <ShotComparison match={match} analysis={analysis} shot={openShot.shot} />
        </>
      ) : deck === "rally" ? (
        <div className={styles.flight}>
          <CourtDrawing
            shots={shots}
            activeIndex={activeIndex}
            time={time}
            tone={(shot) => players.tone(shot.hitter)}
            onSelect={onSelectShot}
            describe={(shot) => `${players.name(shot.hitter)}, ${endLabel(shot).toLowerCase()}`}
          />
          <RallySummary match={match} rally={rally} index={rallyIndex} shots={shots} onSelectShot={onSelectShot} />
        </div>
      ) : (
        <MatchOverview match={match} analysis={analysis} current={rallyIndex} onSelectRally={onSelectRally} />
      )}
      <p className={styles.deckNotice}>
        Shot data is reconstructed automatically from the broadcast and hasn’t been checked by hand. Shot types, shot sequences and
        serve-and-return patterns are planned.
      </p>
    </div>
  );
}
