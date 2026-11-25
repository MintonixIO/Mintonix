"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { Match } from "./contract";
import { Icon } from "./icons";
import { rallyProgress, rallyScore, rallyStrip, rallyTip } from "./rally-strip";
import styles from "./control-bar.module.css";

export type SideOption = "court" | "rallies";

type Props = {
  match: Match;
  missingBefore: readonly number[];
  /** The rally playing, or -1 between rallies. */
  selectedIndex: number;
  time: number;
  ready: boolean;
  playing: boolean;
  muted: boolean;
  skipGaps: boolean;
  canPrevious: boolean;
  canNext: boolean;
  isFullscreen: boolean;
  /**
   * What the side column can show and what it shows (null: collapsed), or null when this view
   * has no side switch (analyze). Showing one option hides the other; picking the shown one collapses.
   */
  side: { options: readonly SideOption[]; shown: SideOption | null; onShow: (option: SideOption) => void } | null;
  listId: string;
  listButtonRef: Ref<HTMLButtonElement>;
  onPlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectRally: (index: number) => void;
  onMute: () => void;
  onSkipGaps: (on: boolean) => void;
  onFullscreen: () => void;
};

/** Everything that drives playback, in one row under the video and court; nothing sits on the video. */
export function ControlBar({
  match, missingBefore, selectedIndex, time, ready, playing, muted, skipGaps, canPrevious, canNext, isFullscreen, side,
  listId, listButtonRef, onPlay, onPrevious, onNext, onSelectRally, onMute, onSkipGaps, onFullscreen,
}: Props) {
  const rallies = match.rallies;
  const games = useMemo(() => rallyStrip(rallies, missingBefore), [rallies, missingBefore]);
  const stripRef = useRef<HTMLDivElement>(null);
  // The rally a pointer or keyboard is on: the position readout previews it.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabTarget = focusIndex ?? Math.max(0, selectedIndex);
  const shown = previewIndex ?? selectedIndex;
  const current = rallies[selectedIndex];
  const progress = current ? rallyProgress(current, time) : 0;

  // Where the strip scrolls (phones), keep the current rally in view without moving the page.
  useEffect(() => {
    const strip = stripRef.current;
    const mark = strip?.querySelector<HTMLElement>(`[data-rally="${selectedIndex}"]`);
    if (!strip || !mark || strip.scrollWidth <= strip.clientWidth) return;
    const left = mark.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + mark.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = left - strip.clientWidth / 3;
    }
  }, [selectedIndex]);

  function focusRally(index: number) {
    const target = Math.max(0, Math.min(rallies.length - 1, index));
    setFocusIndex(target);
    stripRef.current?.querySelector<HTMLButtonElement>(`[data-rally="${target}"]`)?.focus();
  }

  function handleStripKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: tabTarget - 1, ArrowRight: tabTarget + 1, Home: 0, End: rallies.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusRally(moves[event.key]);
  }

  return (
    <div className={styles.bar} role="group" aria-label="Playback">
      <div className={styles.transport}>
        <button type="button" className={styles.iconButton} disabled={!ready} aria-label={playing ? "Pause" : "Play"} onClick={onPlay}><Icon name={playing ? "pause" : "play"} /></button>
        <button type="button" className={styles.iconButton} disabled={!ready || !canPrevious} aria-label="Previous rally" title="Previous rally" onClick={onPrevious}><Icon name="previous" /></button>
        <button type="button" className={styles.iconButton} disabled={!ready || !canNext} aria-label="Next rally" title="Next rally" onClick={onNext}><Icon name="next" /></button>
        <p className={styles.position} data-preview={previewIndex !== null || undefined} aria-live="off">
          <span>Rally <b>{shown >= 0 ? shown + 1 : "–"}</b> <span className={styles.count}>/ {rallies.length}</span></span>
          <span className={styles.detail}>{shown < 0 ? "Between rallies" : previewIndex !== null ? rallyTip(match, shown) : `G${rallies[shown].game} · ${rallyScore(match, shown)}`}</span>
        </p>
      </div>

      <div ref={stripRef} className={styles.strip} role="group" aria-label="Rallies by game" onKeyDown={handleStripKey}
        onPointerLeave={() => setPreviewIndex(null)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setPreviewIndex(null); setFocusIndex(null); } }}>
        {games.map((game) => (
          <div key={game.game} className={styles.game} style={{ flexGrow: game.weight }}>
            <span className={styles.gameLabel} aria-hidden="true">G{game.game}</span>
            <div className={styles.marks}>
              {game.items.map((item, position) => item.kind === "missing" ? (
                <span key={`missing-${position}`} className={styles.missing} title={`${item.count} ${item.count === 1 ? "point" : "points"} not captured`} />
              ) : (
                <button key={item.index} type="button" data-rally={item.index} className={styles.mark} disabled={!ready}
                  style={{ flexGrow: item.weight }} tabIndex={item.index === tabTarget ? 0 : -1}
                  data-state={item.index === selectedIndex ? "current" : item.index < selectedIndex || (selectedIndex < 0 && rallies[item.index].segments.at(-1)![1] <= time) ? "played" : undefined}
                  aria-current={item.index === selectedIndex ? "true" : undefined} aria-label={`Rally ${item.index + 1}: ${rallyTip(match, item.index)}`}
                  onPointerEnter={() => setPreviewIndex(item.index)} onFocus={() => { setFocusIndex(item.index); setPreviewIndex(item.index); }}
                  onClick={() => onSelectRally(item.index)}>
                  {item.index === selectedIndex && <span className={styles.fill} style={{ width: `${progress * 100}%` }} />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.options}>
        <label className={styles.gapToggle} title="Automatically skip the time between detected rallies"><span>Skip gaps</span><input type="checkbox" role="switch" checked={skipGaps} onChange={(event) => onSkipGaps(event.target.checked)} /><span className={styles.switch} aria-hidden="true" /></label>
        <button type="button" className={styles.iconButton} disabled={!ready} aria-label={muted ? "Unmute audio" : "Mute audio"} onClick={onMute}><Icon name={muted ? "muted" : "volume"} /></button>
        {side && (
          <div className={styles.segmented} role="group" aria-label="Beside the video">
            {side.options.map((option) => (
              <button key={option} ref={option === "rallies" ? listButtonRef : undefined} type="button" aria-pressed={side.shown === option}
                aria-controls={option === "rallies" ? listId : undefined}
                title={side.shown === option ? `Hide the ${option === "court" ? "3D court" : "rally list"}` : `Show the ${option === "court" ? "3D court" : "rally list"}`}
                onClick={() => side.onShow(option)}>
                <Icon name={option === "court" ? "court" : "list"} size={16} /><span>{option === "court" ? "Court" : "Rallies"}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className={styles.iconButton} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}><Icon name={isFullscreen ? "collapse" : "expand"} /></button>
      </div>
    </div>
  );
}
