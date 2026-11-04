"use client";

import { useEffect, useState } from "react";
import { BroadcastCourt, courtPoint, courtScale } from "@/components/ui/court";
import styles from "./rally-demo.module.css";

/** Illustrative rallies on a 0–100 broadcast timeline. Not detected data. */
const rallies = [
  { start: 4, end: 11, score: [0, 0] },
  { start: 19, end: 27, score: [1, 0] },
  { start: 35, end: 40, score: [1, 1] },
  { start: 49, end: 60, score: [2, 1] },
  { start: 68, end: 74, score: [2, 2] },
  { start: 83, end: 94, score: [3, 2] },
] as const;

const TICK_MS = 40;
const STEP = 0.14;
const JUMP_PAUSE_TICKS = 10;
const LOOP_PAUSE_TICKS = 45;

type DemoState = { time: number; jump: { from: number; to: number; id: number } | null };

const near = courtPoint(22, 24);
const far = courtPoint(41, 110);
const apex = courtPoint(31, 67, 36);

export function RallyDemo() {
  const [{ time, jump }, setState] = useState<DemoState>({ time: rallies[3].start + 4, jump: null });
  const index = rallies.findIndex((rally) => time >= rally.start && time < rally.end);
  const current = rallies[Math.max(index, 0)];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hold = 0;
    const timer = window.setInterval(() => {
      if (hold > 0) { hold -= 1; return; }
      setState((state) => {
        const at = rallies.findIndex((rally) => state.time >= rally.start && state.time < rally.end);
        if (at === -1) return { time: rallies[0].start, jump: null };
        const next = state.time + STEP;
        if (next < rallies[at].end) return { ...state, time: next };
        const following = rallies[at + 1];
        hold = following ? JUMP_PAUSE_TICKS : LOOP_PAUSE_TICKS;
        if (!following) return { time: rallies[0].start, jump: null };
        return { time: following.start, jump: { from: rallies[at].end, to: following.start, id: at } };
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <figure className={styles.demo} aria-label="Illustration of the rally viewer: playback jumps from rally to rally, skipping the dead time between them, while the score list follows along">
      <div className={styles.stage} aria-hidden="true">
        <div className={styles.video}>
          <BroadcastCourt className={styles.court}>
            <path className={styles.shuttle} d={`M${near[0]} ${near[1] - 10}Q${apex[0]} ${apex[1]} ${far[0]} ${far[1] - 6}`} />
            <circle className={styles.playerA} cx={near[0]} cy={near[1]} r={7 * courtScale(24)} />
            <circle className={styles.playerB} cx={far[0]} cy={far[1]} r={7 * courtScale(110)} />
          </BroadcastCourt>
          <span className={styles.tag}>Illustration</span>
          <span className={styles.chip}>
            <span className={styles.chipRally}>Rally {Math.max(index, 0) + 1}</span>
            <span className={styles.chipScore}><b className={styles.scoreA}>{current.score[0]}</b><i>–</i><b className={styles.scoreB}>{current.score[1]}</b></span>
          </span>
        </div>

        <ol className={styles.list}>
          {rallies.map((rally, rallyIndex) => (
            <li key={rally.start} data-selected={rallyIndex === index || undefined}>
              <span className={styles.rowNumber}>{rallyIndex + 1}</span>
              <span className={styles.rowScore}><span>{rally.score[0]}</span><i>–</i><span>{rally.score[1]}</span></span>
            </li>
          ))}
        </ol>

        <div className={styles.compaction}>
          <div className={styles.timeline}>
            {rallies.map((rally, rallyIndex) => <i key={rally.start} data-active={rallyIndex === index || undefined} style={{ left: `${rally.start}%`, width: `${rally.end - rally.start}%` }} />)}
            {jump && <span key={jump.id} className={styles.jumpArc} style={{ left: `${jump.from}%`, width: `${jump.to - jump.from}%` }} />}
            <span className={styles.playhead} style={{ left: `${time}%` }} />
          </div>
        </div>
      </div>
    </figure>
  );
}
