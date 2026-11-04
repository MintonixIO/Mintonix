"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatTime, normalizeMediaTime, rallyPlaybackPosition, type RallyManifest } from "./timeline";
import { describeYouTubeError, isSeekPending, loadYouTubeApi, PlayerState, type PendingSeek, type YouTubePlayer } from "./youtube";
import styles from "./rally-player.module.css";

type IconName = "play" | "pause" | "volume" | "muted" | "previous" | "next" | "expand" | "collapse" | "list" | "close";
const iconPaths: Record<IconName, string> = {
  play: "m8 5 11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  volume: "m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  muted: "m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m-6 0 6-6",
  previous: "M5 5v14M19 5 8 12l11 7V5Z",
  next: "M19 5v14M5 5l11 7-11 7V5Z",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  close: "m6 6 12 12M6 18 18 6",
};

function Icon({ name }: { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}

const SYNC_INTERVAL_MS = 100;
const DURATION_TOLERANCE_SECONDS = 2;

export function RallyPlayer({ manifest }: { manifest: RallyManifest }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTubePlayer | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rallies = manifest.rallies;
  const [sourceTime, setSourceTime] = useState(rallies[0].startSeconds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [skipGaps, setSkipGaps] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const selectedIndex = rallies.findIndex((rally, index) => sourceTime >= rally.startSeconds && (sourceTime < rally.endSeconds || (index === rallies.length - 1 && sourceTime === rally.endSeconds)));
  const selected = rallies[selectedIndex];
  const nextIndex = rallies.findIndex((rally) => rally.startSeconds > sourceTime);
  const previousTarget = selectedIndex >= 0 ? selectedIndex - 1 : (nextIndex === -1 ? rallies.length : nextIndex) - 1;
  const nextTarget = selectedIndex >= 0 ? selectedIndex + 1 : nextIndex;
  const { videoId, durationSeconds: duration } = manifest.source;
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
  }, [selectedIndex, panelOpen, isFullscreen]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
      setPanelOpen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!isFullscreen || !panelOpen) return;
    panelRef.current?.querySelector<HTMLButtonElement>("[data-close]")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, panelOpen]);

  // The match plays from its published YouTube upload; nothing is re-hosted.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let instance: YouTubePlayer | null = null;
    const target = document.createElement("div");
    mount.replaceChildren(target);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      setReady(false);
      setIsPlaying(false);
      instance = new YT.Player(target, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, fs: 0, controls: 1, start: Math.floor(firstStart), origin: window.location.origin },
        events: {
          onReady: ({ target: player }) => {
            if (cancelled) return;
            const actual = player.getDuration();
            if (actual > 0 && Math.abs(actual - duration) > DURATION_TOLERANCE_SECONDS) {
              setMediaError("The YouTube video’s length doesn’t match this match’s rally timeline.");
              return;
            }
            // Refresh can preserve `ready` while replacing the player. Only expose
            // this instance to polling and controls once its API is available.
            youtubeRef.current = player;
            setMuted(player.isMuted());
            setReady(true);
          },
          onStateChange: ({ data }) => { if (!cancelled) setIsPlaying(data === PlayerState.playing || data === PlayerState.buffering); },
          onError: ({ data }) => { if (!cancelled) { setIsPlaying(false); setMediaError(describeYouTubeError(data)); } },
        },
      });
    }, (error: Error) => { if (!cancelled) setMediaError(error.message); });
    return () => {
      cancelled = true;
      youtubeRef.current = null;
      pendingSeekRef.current = null;
      instance?.destroy();
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
      setMuted(player.isMuted());
      const pending = pendingSeekRef.current;
      if (pending && isSeekPending(pending, time, performance.now())) return;
      pendingSeekRef.current = null;
      if (playing && skipGaps) {
        const target = rallyPlaybackPosition(rallies, time);
        if (target.ended) player.pauseVideo();
        if (Math.abs(target.time - time) > 0.25) {
          pendingSeekRef.current = { time: target.time, startedAt: performance.now() };
          player.seekTo(target.time, true);
        }
        setSourceTime(target.time);
        return;
      }
      setSourceTime(normalizeMediaTime(rallies, time));
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [ready, skipGaps, rallies]);

  function seek(time: number) {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    const clamped = Math.max(0, Math.min(time, duration));
    pendingSeekRef.current = { time: clamped, startedAt: performance.now() };
    player.seekTo(clamped, true);
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
    if (state === PlayerState.playing || state === PlayerState.buffering) player.pauseVideo();
    else {
      if (skipGaps) {
        const target = rallyPlaybackPosition(rallies, pendingSeekRef.current?.time ?? player.getCurrentTime());
        if (target.ended) seek(firstStart);
        else if (Math.abs(target.time - player.getCurrentTime()) > 0.25 && !pendingSeekRef.current) seek(target.time);
      }
      player.playVideo();
    }
  }

  function toggleMute() {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    if (player.isMuted()) player.unMute();
    else player.mute();
    setMuted(player.isMuted());
  }

  function closePanel() {
    setPanelOpen(false);
    triggerRef.current?.focus();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch {
      setMediaError("Fullscreen is unavailable in this browser.");
    }
  }

  const games = rallies.reduce<{ game: number; indices: number[] }[]>((groups, rally, index) => {
    const last = groups.at(-1);
    if (last && last.game === rally.game) last.indices.push(index);
    else groups.push({ game: rally.game, indices: [index] });
    return groups;
  }, []);

  return (
    <section ref={viewerRef} id="viewer" className={styles.viewer} aria-label="Match viewer" data-playing={isPlaying || undefined}>
      <div className={styles.workspace}>
        <div className={styles.stage}>
          <div ref={mountRef} className={styles.embed} title={manifest.title} />
          {mediaError && <p className={styles.mediaError} role="alert">{mediaError}</p>}

          <div className={styles.rallyDock} role="group" aria-label="Rally navigation">
            <button type="button" className={styles.iconButton} disabled={!ready} aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} /></button>
            <button type="button" className={styles.iconButton} aria-label="Previous rally" title="Previous rally" disabled={!ready || !rallies[previousTarget]} onClick={() => selectRally(previousTarget)}><Icon name="previous" /></button>
            <button ref={triggerRef} type="button" className={styles.ralliesButton} aria-expanded={panelOpen} aria-controls={panelId} aria-haspopup="dialog" onClick={() => setPanelOpen(!panelOpen)}>
              <Icon name="list" /><span>Rallies</span><span className={styles.rallyPosition}>{selected ? selectedIndex + 1 : "–"}<span> / {rallies.length}</span></span>
            </button>
            <button type="button" className={styles.iconButton} aria-label="Next rally" title="Next rally" disabled={!ready || !rallies[nextTarget]} onClick={() => selectRally(nextTarget)}><Icon name="next" /></button>
            <span className={styles.dockDivider} aria-hidden="true" />
            <button type="button" className={styles.iconButton} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen with rally controls"} onClick={() => { void toggleFullscreen(); }}><Icon name={isFullscreen ? "collapse" : "expand"} /></button>
          </div>

        </div>
        <aside ref={panelRef} id={panelId} className={styles.rallyPanel} hidden={isFullscreen && !panelOpen} role={isFullscreen ? "dialog" : undefined} aria-labelledby={`${panelId}-heading`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <h2 id={`${panelId}-heading`}>Rallies <span className={styles.rallyCount}>{rallies.length}</span></h2>
              <div className={styles.panelActions}>
                {!isFullscreen && <button type="button" className={styles.iconButton} disabled={!ready} aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} /></button>}
                <button type="button" className={styles.iconButton} disabled={!ready} aria-label={muted ? "Unmute audio" : "Mute audio"} onClick={toggleMute}><Icon name={muted ? "muted" : "volume"} /></button>
                {isFullscreen ? <button data-close type="button" className={styles.iconButton} aria-label="Close rally controls" onClick={closePanel}><Icon name="close" /></button> : <button type="button" className={styles.iconButton} aria-label="Enter fullscreen" title="Fullscreen with rally controls" onClick={() => { void toggleFullscreen(); }}><Icon name="expand" /></button>}
              </div>
            </div>
            <label className={styles.gapToggle} title="Automatically skip the time between detected rallies"><span>Skip gaps</span><input type="checkbox" role="switch" checked={skipGaps} onChange={(event) => setSkipGaps(event.target.checked)} /><span className={styles.switch} aria-hidden="true" /></label>
            <div className={styles.columnLabels} aria-hidden="true"><span>#</span><span>Score before</span><span>Start</span><span>Length</span></div>
          </div>
          <div ref={listRef} className={styles.listScroll}>
            {games.map(({ game, indices }) => (
              <section key={game} aria-labelledby={`${panelId}-game-${game}`}>
                <h3 id={`${panelId}-game-${game}`} className={styles.gameHeading}><span>Game {game}</span><span>{indices.length} {indices.length === 1 ? "rally" : "rallies"}</span></h3>
                <ol className={styles.rallyList}>
                  {indices.map((index) => {
                    const rally = rallies[index];
                    const isSelected = selectedIndex === index;
                    return (
                      <li key={rally.id}>
                        <button type="button" disabled={!ready} data-selected={isSelected || undefined} className={styles.rallyRow} aria-current={isSelected ? "true" : undefined} aria-label={`Rally ${index + 1}, game ${rally.game}, ${rally.scoreBefore ? `score ${rally.scoreBefore.join(" to ")}` : "score unknown"}, ${formatTime(rally.startSeconds)} in original video`} onClick={() => selectRally(index)}>
                          <span className={styles.rallyNumber}>{isSelected && isPlaying ? <span className={styles.equalizer} aria-hidden="true"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>
                          <span className={styles.rallyScore}>{rally.scoreBefore ? <><span>{rally.scoreBefore[0]}</span><span className={styles.scoreDash}>–</span><span>{rally.scoreBefore[1]}</span></> : <span className={styles.scoreDash}>No score</span>}</span>
                          <span className={styles.rallyStart}>{formatTime(rally.startSeconds)}</span>
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
