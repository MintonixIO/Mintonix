"use client";

import { useEffect, useRef, useState } from "react";
import match from "@/public/hero/dl1s0/index.json";
import type { PreparedRally, RallyMotion, RallyScene } from "./rally-scene";
import styles from "./rally-demo.module.css";

/*
 * A miniature of the watch page driven by a real reconstructed match excerpt:
 * scores and rally spans come from the detected manifest, and the 3D court
 * replays each rally's reconstructed poses and shuttle flight.
 * Regenerate with RESEARCH/scripts/export_hero.py.
 */
const MOTION_URL = (index: number) => `/hero/dl1s0/r${index}.json`;
const { rallies, duration, fps } = match;
const JUMP_MS = 700;
const LOOP_MS = 1600;

const percent = (seconds: number) => `${(seconds / duration) * 100}%`;

export function RallyDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState<{ from: number; to: number; id: number } | null>(null);
  const [touched, setTouched] = useState(false);
  const rally = rallies[current];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: RallyScene | null = null;
    let raf = 0;
    let onScreen = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loaded = new Map<number, Promise<PreparedRally>>();
    const ready = new Map<number, PreparedRally>();
    const state = { index: 0, frame: 0, holdUntil: 0, last: 0 };

    let prepare: ((motion: RallyMotion, frames: number) => PreparedRally) | null = null;
    const load = (index: number) => {
      if (!loaded.has(index)) {
        loaded.set(index, fetch(MOTION_URL(index)).then((r) => r.json() as Promise<RallyMotion>).then((motion) => {
          const prepared = prepare!(motion, rallies[index].frames);
          ready.set(index, prepared);
          return prepared;
        }));
      }
      return loaded.get(index)!;
    };

    const placePlayhead = () => {
      const seconds = rallies[state.index].start + state.frame / fps;
      if (playheadRef.current) playheadRef.current.style.left = percent(Math.min(seconds, rallies[state.index].end));
    };

    const tick = (now: number) => {
      raf = 0;
      if (disposed || !scene) return;
      const dt = state.last ? Math.min(now - state.last, 100) : 0;
      state.last = now;
      const prepared = ready.get(state.index) ?? null;
      if (!reduced && prepared && now >= state.holdUntil) {
        state.frame += (dt / 1000) * fps;
        if (state.frame >= prepared.frames) {
          // Rally over: hop the dead time to the next rally, as the watch page does.
          const from = state.index;
          const to = (from + 1) % rallies.length;
          state.index = to;
          state.frame = 0;
          state.holdUntil = now + (to === 0 ? LOOP_MS : JUMP_MS);
          setCurrent(to);
          setJump(to === 0 ? null : { from: rallies[from].end, to: rallies[to].start, id: from });
          load(to);
          load((to + 1) % rallies.length);
        }
      }
      placePlayhead();
      const moving = scene.update(ready.get(state.index) ?? null, state.frame);
      if (onScreen && (!reduced || moving)) raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && !disposed) { state.last = 0; raf = requestAnimationFrame(tick); } };

    (async () => {
      const { RallyScene: Scene, prepareRally } = await import("./rally-scene");
      if (disposed) return;
      prepare = prepareRally;
      const style = getComputedStyle(canvas);
      const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      scene = new Scene(canvas, {
        a: color("--player-a", "#3693ff"),
        b: color("--player-b", "#8b9cff"),
        court: color("--ink-200", "#969aa5"),
        shuttle: color("--text-strong", "#f3f4f6"),
      });
      scene.onInteract = () => { setTouched(true); start(); };
      resetRef.current = () => { scene?.resetView(); setTouched(false); start(); };
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      if (reduced) {
        // A still frame from the middle of the first rally; dragging still works.
        state.frame = Math.floor(rallies[0].frames / 2);
      }
      await load(0);
      load(1);
      start();
    })();

    const resize = new ResizeObserver(() => { scene?.resize(canvas.clientWidth, canvas.clientHeight); start(); });
    resize.observe(canvas);
    const visible = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (onScreen) start(); });
    visible.observe(canvas);
    // Reduced motion: frames are only drawn while the view is being dragged.
    const wake = () => start();
    canvas.addEventListener("pointermove", wake);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      visible.disconnect();
      canvas.removeEventListener("pointermove", wake);
      scene?.dispose();
    };
  }, []);

  return (
    <figure className={styles.demo} aria-label="Preview of the rally viewer: a 3D reconstruction of each rally from a recorded match excerpt plays in turn, skipping the dead time between rallies, while the real score list and rally timeline follow along. Drag the court to rotate it.">
      <div className={styles.stage}>
        <div className={styles.video}>
          <canvas ref={canvasRef} className={styles.canvas} aria-label="3D court, drag to rotate" />
          <span className={styles.tag}>
            3D preview
            {touched
              ? <button type="button" className={styles.reset} onClick={() => resetRef.current()}>Reset view</button>
              : <span className={styles.hint}>Drag to rotate</span>}
          </span>
          <span className={styles.chip} aria-live="polite">
            <span className={styles.chipRally}>Rally {current + 1}</span>
            <span className={styles.chipScore}><b className={styles.scoreA}>{rally.score[0]}</b><i>–</i><b className={styles.scoreB}>{rally.score[1]}</b></span>
          </span>
        </div>

        <ol className={styles.list} aria-label="Rallies by score before each rally">
          {rallies.map((item, index) => (
            <li key={item.start} data-selected={index === current || undefined}>
              <span className={styles.rowNumber}>{index + 1}</span>
              <span className={styles.rowScore}><span>{item.score[0]}</span><i>–</i><span>{item.score[1]}</span></span>
            </li>
          ))}
        </ol>

        <div className={styles.compaction} aria-hidden="true">
          <div className={styles.timeline}>
            {rallies.map((item, index) => <i key={item.start} data-active={index === current || undefined} style={{ left: percent(item.start), width: percent(item.end - item.start) }} />)}
            {jump && <span key={jump.id} className={styles.jumpArc} style={{ left: percent(jump.from), width: percent(jump.to - jump.from) }} />}
            <span ref={playheadRef} className={styles.playhead} style={{ left: percent(rallies[0].start) }} />
          </div>
        </div>
      </div>
    </figure>
  );
}
