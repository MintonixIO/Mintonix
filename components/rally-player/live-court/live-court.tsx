"use client";

import { useEffect, useRef, useState } from "react";
import type { Match, RallyMotion, Shot } from "../contract";
import { playerTools } from "../analysis/players";
import { activeShotIndex, shuttleAt } from "../analysis/shots";
import { WebGLUnavailableError } from "../analysis/shot-scene";
import type { Vec3 } from "../analysis/replay";
import { rallyStart } from "../timeline";
import { createCourtScene, type CourtScene } from "./court-scene";
import { decodeMotion, distanceSoFar, frameAt, poseAt, tagAt, tagText, type Skeletons } from "./motion";
import styles from "./live-court.module.css";

type Props = {
  match: Match;
  /** The rally on the court: the one playing, or the one that just ended; -1 before the first. */
  rallyIndex: number;
  time: number;
  playing: boolean;
  /** The rally's shots, once the shot data has loaded. */
  shots: readonly Shot[];
};

// Decoded rally files, shared by every live court on the page (a rally decodes once).
const cache = new Map<string, Promise<Skeletons | null>>();

function loadSkeletons(matchId: string, rallyId: string) {
  const key = `${matchId}/${rallyId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`/api/matches/${encodeURIComponent(matchId)}/rallies/${encodeURIComponent(rallyId)}`)
      .then(async (response) => response.ok ? decodeMotion(await response.json() as RallyMotion) : null)
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, pending);
  }
  return pending;
}

/** The current rally's skeletons; the next rally's file is fetched ahead. */
function useSkeletons(match: Match, rallyIndex: number) {
  const rallyId = match.rallies[rallyIndex]?.id;
  const [state, setState] = useState<{ rallyId?: string; skeletons: Skeletons | null }>({ skeletons: null });
  useEffect(() => {
    if (!rallyId) return;
    let live = true;
    void loadSkeletons(match.matchId, rallyId).then((skeletons) => { if (live) setState({ rallyId, skeletons }); });
    const next = match.rallies[rallyIndex + 1]?.id;
    if (next) void loadSkeletons(match.matchId, next);
    return () => { live = false; };
  }, [match, rallyIndex, rallyId]);
  return { skeletons: state.rallyId === rallyId ? state.skeletons : null, loading: Boolean(rallyId) && state.rallyId !== rallyId };
}

/** The playhead between the player's 100 ms polls, so skeletons move at the video's frame rate. */
function useSmoothTime(time: number, playing: boolean) {
  const [smooth, setSmooth] = useState(time);
  const reported = useRef({ time, at: 0 });
  useEffect(() => {
    reported.current = { time, at: performance.now() };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new poll resets the clock
    setSmooth(time);
  }, [time]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const { time: base, at } = reported.current;
      // Never run more than a quarter second past the last poll (a stalled player).
      setSmooth(base + Math.min(0.25, (now - at) / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return playing ? smooth : time;
}

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rallyEndTime(match: Match, index: number) {
  return match.rallies[index].segments.at(-1)![1];
}

export default function LiveCourt({ match, rallyIndex, time, playing, shots }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CourtScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [tagPosition, setTagPosition] = useState<{ x: number; y: number } | null>(null);
  const players = playerTools(match);
  const [first, second] = match.players;
  const { skeletons, loading } = useSkeletons(match, rallyIndex);
  const smoothTime = useSmoothTime(time, playing);

  // Between rallies the court holds the last frame of the rally that just ended; before the
  // first rally it stays empty.
  const rally = match.rallies[rallyIndex];
  const started = rally ? smoothTime >= rallyStart(rally) : false;
  const shownTime = rally ? Math.min(smoothTime, rallyEndTime(match, rallyIndex) - 1e-3) : smoothTime;
  const frame = skeletons ? frameAt(shownTime, skeletons.fps) : -1;
  const tagIndex = started ? tagAt(shots, shownTime) : null;
  const tagShot = tagIndex === null ? null : shots[tagIndex];
  const tag = tagShot ? tagText(tagShot) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: CourtScene;
    try {
      scene = createCourtScene(canvas, {
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
    scene.setPlayers({ [first.id]: token("--player-a"), [second.id]: token("--player-b") });
    sceneRef.current = scene;
    scene.onChange(() => scene.render());
    scene.onMoved(() => setMoved(true));
    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [first.id, second.id]);

  // Draw the frame: skeletons at the playhead, and the shuttle along the shot in flight.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const poses = Object.fromEntries(match.players.map((player) =>
      [player.id, skeletons && started ? poseAt(skeletons.players[player.id], frame) : null]));
    const active = started ? activeShotIndex(shots, shownTime) : -1;
    const shot = active >= 0 ? shots[active] : null;
    const position = shot ? shuttleAt(shot, shownTime) : null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trail: Vec3[] = shot && position && !reduced
      ? [...shot.path.filter(([t]) => t <= shownTime).map(([, x, y, z]): Vec3 => [x, y, z]), position]
      : [];
    const tone = shot ? players.tone(shot.hitter) : "none";
    const colour = token(tone === "a" ? "--player-a" : tone === "b" ? "--player-b" : "--brand");
    scene.setFrame(poses, position ? { position, trail, colour } : null);
    scene.render();
    setTagPosition(tagShot?.hitter ? scene.headOnCanvas(tagShot.hitter) : null);
    // players is rebuilt each render from match; match covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, skeletons, frame, started, shots, shownTime, tagShot]);

  const distances = match.players.map((player) => {
    const metres = skeletons && started ? distanceSoFar(skeletons, player.id, frame) : null;
    return { player, metres };
  });
  const tagTone = tagShot ? players.tone(tagShot.hitter) : "none";

  return (
    <section className={styles.court} aria-label="Live court">
      <div className={styles.stage} hidden={failed}>
        <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="3D court, drag to rotate"
          onKeyDown={(event) => {
            const step = 0.12;
            const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            sceneRef.current?.orbit(...move);
          }} />
        {tag && tagPosition && (
          <span key={tagIndex} className={styles.tag} data-tone={tagTone} aria-hidden="true"
            style={{ left: tagPosition.x, top: tagPosition.y }}>{tag}</span>
        )}
        {moved && (
          <button type="button" className={styles.reset} onClick={() => { sceneRef.current?.resetView(); setMoved(false); }}>Reset view</button>
        )}
        {loading && <span className={styles.status} role="status">Loading players…</span>}
      </div>
      <p className={styles.distances}>
        {distances.map(({ player, metres }, index) => (
          <span key={player.id} data-tone={index === 0 ? "a" : "b"}>
            <span className={styles.dot} aria-hidden="true" />{players.shortName(player.id)} {metres === null ? "–" : `${metres.toFixed(1)} m`}
          </span>
        ))}
      </p>
      <p className={styles.srOnly} aria-live="polite">{tag ? `${players.name(tagShot!.hitter)}: ${tag}` : ""}</p>
      <p className={styles.caption}>3D estimate from the broadcast, not checked by hand. Distance run this rally; stroke types are a model’s inference.</p>
    </section>
  );
}
