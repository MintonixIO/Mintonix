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

/** Score labels that fit on a rail this wide: the current rally's always, then any that won't overlap. */
const LABEL_PX = 48;
function labelled(current: number, width: number) {
  const gap = (LABEL_PX / Math.max(width, 1)) * duration;
  const shown = [current];
  rallies.forEach((rally, index) => {
    if (shown.every((other) => Math.abs(rallies[other].start - rally.start) >= gap)) shown.push(index);
  });
  return new Set(shown);
}

export function RallyDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const goToRef = useRef<(index: number) => void>(() => {});
  const [railWidth, setRailWidth] = useState(560);
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState<{ from: number; to: number; id: number } | null>(null);
  const labels = labelled(current, railWidth);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(([entry]) => setRailWidth(entry.contentRect.width));
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

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

    const show = (to: number, now: number, hop: boolean) => {
      const from = state.index;
      state.index = to;
      state.frame = reduced ? Math.floor(rallies[to].frames / 2) : 0;
      state.holdUntil = now + (to === 0 && hop ? LOOP_MS : JUMP_MS);
      setCurrent(to);
      setJump(hop && to !== 0 ? { from: rallies[from].end, to: rallies[to].start, id: from } : null);
      if (prepare) { load(to); load((to + 1) % rallies.length); }
    };

    const tick = (now: number) => {
      raf = 0;
      if (disposed || !scene) return;
      const dt = state.last ? Math.min(now - state.last, 100) : 0;
      state.last = now;
      const prepared = ready.get(state.index) ?? null;
      if (!reduced && prepared && now >= state.holdUntil) {
        state.frame += (dt / 1000) * fps;
        // Rally over: hop the dead time to the next rally, as the watch page does.
        if (state.frame >= prepared.frames) show((state.index + 1) % rallies.length, now, true);
      }
      placePlayhead();
      const moving = scene.update(ready.get(state.index) ?? null, state.frame, now);
      if (onScreen && (!reduced || moving)) raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && !disposed) { state.last = 0; raf = requestAnimationFrame(tick); } };
    goToRef.current = (index) => { show(index, performance.now(), false); start(); };

    (async () => {
      const { RallyScene: Scene, prepareRally } = await import("./rally-scene");
      if (disposed) return;
      prepare = prepareRally;
      const style = getComputedStyle(canvas);
      const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      scene = new Scene(canvas, {
        a: color("--player-a", "#3693ff"),
        b: color("--player-b", "#8b9cff"),
        court: color("--ink-100", "#c4c7ce"),
        shuttle: color("--text-strong", "#f3f4f6"),
        background: color("--bg-base", "#0b0c0e"),
      }, { drift: !reduced });
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      // Reduced motion: a still frame from the middle of the rally; dragging still works.
      if (reduced) state.frame = Math.floor(rallies[state.index].frames / 2);
      await load(state.index);
      load((state.index + 1) % rallies.length);
      start();
    })();

    const resize = new ResizeObserver(() => { scene?.resize(canvas.clientWidth, canvas.clientHeight); start(); });
    resize.observe(canvas);
    const visible = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (onScreen) start(); });
    visible.observe(canvas);
    // With reduced motion frames are only drawn while the court is being dragged.
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
    <figure className={styles.demo} aria-label="Preview of the rally viewer: a 3D reconstruction of each rally from a recorded match excerpt plays in turn, skipping the dead time between rallies, while the rally rail shows each rally's score and place in the match.">
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="3D court, drag to rotate" />
        <span className={styles.note}>3D preview</span>
        <span className={styles.hint} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 4 0 0 0 15.5 2.8M21 12a9 4 0 0 0-15.5-2.8" /><path d="m16 13 2.6 1.9L20 12M8 11 5.4 9.1 4 12" /></svg>
          Drag to rotate
        </span>
      </div>

      <div ref={railRef} className={styles.rail}>
        <ol className={styles.rallies} aria-label="Rallies by score">
          {rallies.map((item, index) => (
            <li key={item.start} style={{ left: percent(item.start), width: percent(item.end - item.start) }} data-selected={index === current || undefined} data-played={index < current || undefined} data-unlabelled={!labels.has(index) || undefined}>
              <button type="button" onClick={() => goToRef.current(index)} aria-label={`Rally ${index + 1}, ${item.score[0]}–${item.score[1]}`} aria-current={index === current || undefined}>
                <span className={styles.railScore}><span>{item.score[0]}</span><i>–</i><span>{item.score[1]}</span></span>
                <span className={styles.railBar} />
              </button>
            </li>
          ))}
        </ol>
        {jump && <span key={jump.id} className={styles.jumpArc} style={{ left: percent(jump.from), width: percent(jump.to - jump.from) }} aria-hidden="true" />}
        <span ref={playheadRef} className={styles.playhead} style={{ left: percent(rallies[0].start) }} aria-hidden="true" />
      </div>
    </figure>
  );
}
