"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Match, Shot } from "../contract";
import { playerTools } from "./players";
import { CAMERA_PRESETS, flightBounds, REPLAY_SPEEDS, replayKeyAction, replayTime, type CameraPreset } from "./replay";
import { createShotScene, WebGLUnavailableError, type ShotScene } from "./shot-scene";
import { shotTypeView } from "./shot-types";
import { qualityNote } from "./shots";
import styles from "./analysis.module.css";

export type ShotStageProps = {
  match: Match;
  shot: Shot;
  index: number;
  count: number;
  onStep: (index: number) => void;
  onClose: () => void;
};

const PRESET_LABELS: Record<CameraPreset, string> = { broadcast: "Broadcast", side: "Side", top: "Top", hitter: "Hitter" };

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A looping 3D replay of one shot, reconstructed from its measured flight path. It takes the
 * place of the hidden YouTube embed; it is never drawn over the video.
 */
export default function ShotStage({ match, shot, index, count, onStep, onClose }: ShotStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ShotScene | null>(null);
  // Replay-clock seconds already scaled by speed, so changing speed never jumps.
  const clockRef = useRef(0);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [speed, setSpeed] = useState<number>(1);
  const [preset, setPreset] = useState<CameraPreset>("broadcast");
  const bounds = flightBounds(shot);
  const [time, setTime] = useState(reducedMotion ? bounds.end : bounds.start);
  const [shownShot, setShownShot] = useState(shot);
  const hasPath = shot.path.length > 0;
  const tone = playerTools(match).tone(shot.hitter);
  const note = qualityNote(shot);
  const type = shotTypeView(shot);

  // A new shot restarts the replay (adjusting state during render, not in an effect).
  if (shownShot !== shot) {
    setShownShot(shot);
    setTime(reducedMotion ? bounds.end : bounds.start);
    setPlaying(!reducedMotion);
  }

  // Take focus for the keyboard controls, and bring the replay into view when it opened off-screen
  // (on narrow layouts the rail sits below the video).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    const { top, bottom } = root.getBoundingClientRect();
    // An absolute target, so a repeated run (e.g. StrictMode) lands in the same place.
    if (top < 0 || bottom > window.innerHeight) window.scrollTo({ top: window.scrollY + top - 8, behavior: reducedMotion ? "auto" : "smooth" });
    // Only on opening; stepping between shots keeps the view where the viewer left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create the scene once there is a path to draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!hasPath || !canvas) return;
    let scene: ShotScene;
    try {
      scene = createShotScene(canvas, {
        brand: token("--brand"),
        court: token("--surface-1"),
        lines: token("--text-muted"),
        net: token("--border-strong"),
        background: token("--bg-sunken"),
      });
    } catch (error) {
      if (error instanceof WebGLUnavailableError) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL support is only known once the canvas exists
        setFailed(true);
        return;
      }
      throw error;
    }
    sceneRef.current = scene;
    scene.onChange(() => scene.render());
    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [hasPath]);

  // Load the shot into the scene; the hitter camera depends on the shot, so re-aim too.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    clockRef.current = 0;
    const colour = token(tone === "a" ? "--player-a" : tone === "b" ? "--player-b" : "--text-secondary");
    scene.setShot(shot, colour);
    scene.setCamera(preset, false);
    scene.resize();
    // preset is applied by its own handler; only a new shot re-aims here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, tone, hasPath]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setTime(time);
    scene.render();
  }, [time, shot, hasPath]);

  // Advance the replay clock while playing.
  useEffect(() => {
    if (!playing || !hasPath) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clockRef.current += ((now - last) / 1000) * speed;
      last = now;
      setTime(replayTime(shot, clockRef.current, 1));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, shot, hasPath]);

  function choosePreset(next: CameraPreset) {
    setPreset(next);
    sceneRef.current?.setCamera(next, !reducedMotion);
  }

  function scrub(value: number) {
    setPlaying(false);
    clockRef.current = value - bounds.start;
    setTime(value);
  }

  function togglePlaying() {
    if (!playing && time >= bounds.end) clockRef.current = 0;
    setPlaying(!playing);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLInputElement ? "input" : event.target instanceof HTMLButtonElement ? "button" : "other";
    const action = replayKeyAction(event.key, target, { index, count, hasPath });
    if (!action) return;
    event.preventDefault();
    if (action === "toggle") togglePlaying();
    else if (action === "previous") onStep(index - 1);
    else if (action === "next") onStep(index + 1);
    else onClose();
  }

  const live = hasPath && !failed;
  return (
    <div ref={rootRef} className={styles.replay} tabIndex={-1} onKeyDown={handleKeyDown} role="region" aria-label={`3D replay of shot ${index + 1} of ${count}`}>
      <div className={styles.replayView}>
        {live && <canvas ref={canvasRef} className={styles.replayCanvas} aria-hidden="true" />}
        {!hasPath && <p className={styles.replayMessage}>No 3D path for this shot</p>}
        {hasPath && failed && <p className={styles.replayMessage}>This browser can&apos;t show the 3D replay</p>}
        <div className={styles.replayLabels}>
          <span className={styles.replayBadge}>3D reconstruction</span>
          {type?.name && <span className={styles.replayBadge}>{type.confident ? type.label : `${type.label}?`} · {type.corrected ? "corrected by flight" : `model ${Math.round(type.probability * 100)}%`}</span>}
          {note && <span className={styles.replayNote} data-quality={shot.quality}>{note}</span>}
        </div>
      </div>
      <div className={styles.replayControls}>
        <div className={styles.replayGroup}>
          <button type="button" className={styles.replayButton} disabled={index === 0} aria-label="Previous shot" title="Previous shot (←)" onClick={() => onStep(index - 1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          {live && (
            <button type="button" className={styles.replayButton} aria-label={playing ? "Pause replay" : "Play replay"} title="Play or pause (Space)" onClick={togglePlaying}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={playing ? "M8 5v14M16 5v14" : "m8 5 11 7-11 7V5Z"} /></svg>
            </button>
          )}
          <button type="button" className={styles.replayButton} disabled={index >= count - 1} aria-label="Next shot" title="Next shot (→)" onClick={() => onStep(index + 1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <span className={styles.replayPosition}>Shot {index + 1} <span>/ {count}</span></span>
        </div>
        {live && (
          <>
            <input className={styles.replayScrub} type="range" min={bounds.start} max={bounds.end} step={0.01} value={time}
              aria-label="Replay position" onChange={(event) => scrub(Number(event.target.value))} />
            <div className={styles.segmented} role="group" aria-label="Replay speed">
              {REPLAY_SPEEDS.map((option) => (
                <button key={option} type="button" aria-pressed={speed === option} onClick={() => setSpeed(option)}>{option}×</button>
              ))}
            </div>
            <div className={styles.segmented} role="group" aria-label="Camera">
              {CAMERA_PRESETS.map((option) => (
                <button key={option} type="button" aria-pressed={preset === option} onClick={() => choosePreset(option)}>{PRESET_LABELS[option]}</button>
              ))}
            </div>
          </>
        )}
        <button type="button" className={styles.backButton} onClick={onClose} title="Back to video (Esc)">Back to video</button>
      </div>
    </div>
  );
}
