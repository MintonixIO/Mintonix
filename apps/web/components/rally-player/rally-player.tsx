"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime, normalizeMediaTime, rallyPlaybackPosition, type RallyManifest } from "./timeline";
import { describeYouTubeError, loadYouTubeApi, PlayerState, type YouTubePlayer } from "./youtube";
import styles from "./rally-player.module.css";

type IconName = "play" | "pause" | "previous" | "next" | "expand";
const iconPaths: Record<IconName, string> = {
  play: "M8 5l11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  previous: "M5 5v14M19 5 8 12l11 7V5Z",
  next: "M19 5v14M5 5l11 7-11 7V5Z",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
};

function Icon({ name }: { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={name === "play" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}

const SYNC_INTERVAL_MS = 100;
const SEEK_SETTLE_MS = 700;
const DURATION_TOLERANCE_SECONDS = 2;

export function RallyPlayer({ manifest }: { manifest: RallyManifest }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTubePlayer | null>(null);
  const lastSeekRef = useRef(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rallies = manifest.rallies;
  const [sourceTime, setSourceTime] = useState(rallies[0].startSeconds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [skipGaps, setSkipGaps] = useState(true);
  const [mediaError, setMediaError] = useState("");
  const selectedIndex = rallies.findIndex((rally, index) => sourceTime >= rally.startSeconds && (sourceTime < rally.endSeconds || (index === rallies.length - 1 && sourceTime === rally.endSeconds)));
  const selected = rallies[selectedIndex];
  const nextIndex = rallies.findIndex((rally) => rally.startSeconds > sourceTime);
  const previousTarget = selectedIndex >= 0 ? selectedIndex - 1 : (nextIndex === -1 ? rallies.length : nextIndex) - 1;
  const nextTarget = selectedIndex >= 0 ? selectedIndex + 1 : nextIndex;
  const { videoId, durationSeconds: duration } = manifest.source;
  const progress = Math.min(100, Math.max(0, sourceTime / duration * 100));
  const firstStart = rallies[0].startSeconds;

  // Keep the current rally visible in the list without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>("[aria-current='true']");
    if (!list || !row) return;
    const top = row.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 3, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, [selectedIndex]);

  // The match plays from its published YouTube upload; nothing is re-hosted.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    const target = document.createElement("div");
    mount.replaceChildren(target);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      youtubeRef.current = new YT.Player(target, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, start: Math.floor(firstStart), origin: window.location.origin },
        events: {
          onReady: ({ target: player }) => {
            if (cancelled) return;
            const actual = player.getDuration();
            if (actual > 0 && Math.abs(actual - duration) > DURATION_TOLERANCE_SECONDS) {
              setMediaError("The YouTube video’s length doesn’t match this match’s rally timeline.");
              return;
            }
            setReady(true);
          },
          onStateChange: ({ data }) => setIsPlaying(data === PlayerState.playing || data === PlayerState.buffering),
          onError: ({ data }) => { setIsPlaying(false); setMediaError(describeYouTubeError(data)); },
        },
      });
    }, (error: Error) => { if (!cancelled) setMediaError(error.message); });
    return () => {
      cancelled = true;
      youtubeRef.current?.destroy();
      youtubeRef.current = null;
      mount.replaceChildren();
    };
  }, [videoId, duration, firstStart]);

  // The IFrame API has no time-update event, so poll the playhead.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const player = youtubeRef.current;
      if (!player) return;
      const time = player.getCurrentTime();
      const playing = player.getPlayerState() === PlayerState.playing;
      const settling = performance.now() - lastSeekRef.current < SEEK_SETTLE_MS;
      if (playing && skipGaps && !settling) {
        const target = rallyPlaybackPosition(rallies, time);
        if (target.ended) player.pauseVideo();
        if (Math.abs(target.time - time) > 0.25) {
          player.seekTo(target.time, true);
          lastSeekRef.current = performance.now();
        }
        setSourceTime(target.time);
        return;
      }
      if (!settling) setSourceTime(normalizeMediaTime(rallies, time));
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [ready, skipGaps, rallies]);

  function seek(time: number) {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    const clamped = Math.max(0, Math.min(time, duration));
    player.seekTo(clamped, true);
    lastSeekRef.current = performance.now();
    setSourceTime(normalizeMediaTime(rallies, clamped));
  }

  function selectRally(index: number) {
    const rally = rallies[index];
    if (rally) seek(rally.startSeconds);
  }

  function togglePlayback() {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    const state = player.getPlayerState();
    if (state === PlayerState.playing || state === PlayerState.buffering) {
      player.pauseVideo();
      return;
    }
    if (skipGaps) {
      const target = rallyPlaybackPosition(rallies, player.getCurrentTime());
      seek(target.ended ? rallies[0].startSeconds : target.time);
    } else if (state === PlayerState.ended) {
      seek(0);
    }
    player.playVideo();
    setMediaError("");
  }

  const games = rallies.reduce<{ game: number; indices: number[] }[]>((groups, rally, index) => {
    const last = groups.at(-1);
    if (last && last.game === rally.game) last.indices.push(index);
    else groups.push({ game: rally.game, indices: [index] });
    return groups;
  }, []);

  return (
    <section id="viewer" className={styles.viewer} aria-label="Match viewer" data-playing={isPlaying || undefined}>
      <div className={styles.workspace}>
        <div ref={playerRef} className={styles.playerColumn}>
          <div className={styles.poster}>
            <div ref={mountRef} className={styles.embed} title={manifest.title} />
          </div>
          {mediaError && <p className={styles.mediaError} role="alert">{mediaError}</p>}

          <div className={styles.controls}>
            <div className={styles.timeline}>
              <div className={styles.segments} aria-hidden="true">
                {rallies.map((rally, index) => <span key={rally.id} className={index === selectedIndex ? styles.activeSegment : styles.segment} style={{ left: `${rally.startSeconds / duration * 100}%`, width: `${(rally.endSeconds - rally.startSeconds) / duration * 100}%` }} />)}
                <span className={styles.playhead} style={{ left: `${progress}%` }} />
              </div>
              <input type="range" min={0} max={duration} step={0.01} value={sourceTime} disabled={!ready} onChange={(event) => seek(Number(event.target.value))} aria-label="Match video timeline" aria-valuetext={`${formatTime(sourceTime)} of ${formatTime(duration)}${selected ? `, rally ${selectedIndex + 1}` : ", between rallies"}`} />
            </div>

            <div className={styles.transport}>
              <div className={styles.transportLeft}>
                <button type="button" className={styles.playButton} disabled={!ready} aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} /></button>
                <button type="button" className={styles.iconButton} aria-label="Previous rally" title="Previous rally" disabled={!ready || !rallies[previousTarget]} onClick={() => selectRally(previousTarget)}><Icon name="previous" /></button>
                <button type="button" className={styles.iconButton} aria-label="Next rally" title="Next rally" disabled={!ready || !rallies[nextTarget]} onClick={() => selectRally(nextTarget)}><Icon name="next" /></button>
                <span className={styles.timeReadout}><span>{formatTime(sourceTime)}</span><span className={styles.timeDivider}>/</span>{formatTime(duration)}</span>
                <span className={styles.scoreChip} aria-live="polite">
                  {selected ? (
                    <>
                      <span className={styles.chipRally}>Rally {selectedIndex + 1}</span>
                      {selected.scoreBefore && <span className={styles.chipScore}><b className={styles.scoreA}>{selected.scoreBefore[0]}</b><span aria-hidden="true">–</span><b className={styles.scoreB}>{selected.scoreBefore[1]}</b><span className={styles.visuallyHidden}> score before rally, game {selected.game}</span></span>}
                    </>
                  ) : <span className={styles.chipRally}>Between rallies</span>}
                </span>
              </div>
              <div className={styles.transportRight}>
                <label className={styles.gapToggle}><input type="checkbox" role="switch" checked={skipGaps} onChange={(event) => setSkipGaps(event.target.checked)} /><span className={styles.switch} aria-hidden="true" />Skip gaps</label>
                <button type="button" className={styles.iconButton} disabled={!ready} aria-label="Fullscreen video" title="Fullscreen" onClick={() => { void playerRef.current?.requestFullscreen().catch(() => setMediaError("Fullscreen is unavailable in this browser.")); }}><Icon name="expand" /></button>
              </div>
            </div>
          </div>
        </div>

        <aside className={styles.rallyPanel} aria-labelledby="rallies-heading">
          <div className={styles.panelHeader}>
            <h2 id="rallies-heading">Rallies <span className={styles.rallyCount}>{rallies.length}</span></h2>
            <p>Score before each rally</p>
          </div>
          <div ref={listRef} className={styles.listScroll}>
            {games.map(({ game, indices }) => (
              <section key={game} aria-labelledby={`game-${game}`}>
                <h3 id={`game-${game}`} className={styles.gameHeading}>Game {game}</h3>
                <ol className={styles.rallyList}>
                  {indices.map((index) => {
                    const rally = rallies[index];
                    const isSelected = selectedIndex === index;
                    return (
                      <li key={rally.id}>
                        <button type="button" disabled={!ready} data-selected={isSelected || undefined} className={styles.rallyRow} aria-current={isSelected ? "true" : undefined} aria-label={`Rally ${index + 1}, game ${rally.game}, ${rally.scoreBefore ? `score ${rally.scoreBefore.join(" to ")}` : "score unknown"}, ${formatTime(rally.startSeconds)} in original video`} onClick={() => selectRally(index)}>
                          <span className={styles.rallyNumber}>{isSelected && isPlaying ? <span className={styles.equalizer} aria-hidden="true"><i /><i /><i /></span> : index + 1}</span>
                          <span className={styles.rallyScore}>{rally.scoreBefore ? <><span>{rally.scoreBefore[0]}</span><span className={styles.scoreDash}>–</span><span>{rally.scoreBefore[1]}</span></> : <span className={styles.scoreDash}>No score</span>}</span>
                          <span className={styles.rallyDuration}>{Math.round(rally.endSeconds - rally.startSeconds)}s</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </aside>
      </div>

      <p className={styles.previewNotice}>Rally boundaries and scores were detected automatically and haven’t been reviewed by hand.</p>
    </section>
  );
}
