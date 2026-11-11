"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Match } from "./contract";
import { formatTime, normalizeMediaTime, playableSegments, rallyIndexAt, rallyPlaybackPosition, rallySeconds, rallyStart } from "./timeline";
import { cuePaused, describeYouTubeError, isSeekPending, loadYouTubeApi, PlayerState, type PendingSeek, type YouTubePlayer } from "./youtube";
import { AnalysisDeck, useAnalysis } from "./analysis/analysis-views";
import { MatchRail } from "./analysis/match-level";
import { activeShotIndex, formatShotParam, resolveShot, SHOT_LEAD_SECONDS, shotCueTime, type ShotRef } from "./analysis/shots";
import { missingPointsBefore, missingPointsLabel, missingPointsReason } from "./coverage";
import { setOpenShot, useOpenShot, useView } from "./view";
import { ViewSwitch } from "./view-switch";
import { SearchPanel } from "./search/search-panel";
import type { SearchResult } from "./search/rank";
import styles from "./rally-player.module.css";

// three.js is only fetched when a shot is first opened.
const ShotStage = dynamic(() => import("./analysis/shot-stage"), {
  ssr: false,
  loading: () => <div className={styles.stageLoading} role="status">Loading 3D replay…</div>,
});

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

export function RallyPlayer({ match, hasAnalysis = false }: { match: Match; hasAnalysis?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTubePlayer | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  // A rally picked from search before the player is ready, cued once it is.
  const searchCueRef = useRef<number | null>(null);
  // While a shot replay hides the video, it must never play (or be heard) behind it.
  const shotOpenRef = useRef(false);
  const viewerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rallies = match.rallies;
  const segments = useMemo(() => playableSegments(rallies), [rallies]);
  const missingBefore = useMemo(() => missingPointsBefore(rallies), [rallies]);
  const missingTotal = missingBefore.reduce((sum, count) => sum + count, 0);
  const [sourceTime, setSourceTime] = useState(rallyStart(rallies[0]));
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [skipGaps, setSkipGaps] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // Where the Fullscreen API can't take an element (iPhone Safari), the viewer fills the window instead.
  const [immersive, setImmersive] = useState(false);
  const isFullscreen = nativeFullscreen || immersive;
  const [mediaError, setMediaError] = useState("");
  const selectedIndex = rallyIndexAt(rallies, sourceTime);
  const selected = rallies[selectedIndex];
  const nextIndex = rallies.findIndex((rally) => rallyStart(rally) > sourceTime);
  const previousTarget = selectedIndex >= 0 ? selectedIndex - 1 : (nextIndex === -1 ? rallies.length : nextIndex) - 1;
  const nextTarget = selectedIndex >= 0 ? selectedIndex + 1 : nextIndex;
  const { videoId, durationSeconds: duration } = match.source;
  const firstStart = rallyStart(rallies[0]);
  const [scoreFirst, scoreSecond] = match.players.map((player) => player.id);
  const view = useView(hasAnalysis);
  const analyzing = view === "analyze" && !isFullscreen;
  const { analysis, error: analysisError } = useAnalysis(match.matchId, view === "analyze");
  // The shot open in the 3D replay comes from the URL; it shows only once the analysis has it.
  const openRef = useOpenShot();
  const open = analyzing ? resolveShot(analysis, openRef) : null;
  const openRallyIndex = open ? rallies.findIndex((rally) => rally.id === open.ref.rallyId) : -1;
  const pendingShot = analyzing && openRef !== null && !analysis && !analysisError;
  // Below the video: the match overview, or the rally last picked in the sidebar.
  const [deck, setDeck] = useState<"match" | "rally">("match");
  const [expanded, setExpanded] = useState<number | null>(null);
  // A newly opened shot (including one from a shared link) expands its rally.
  const openKey = open ? formatShotParam(open.ref) : null;
  const [syncedShot, setSyncedShot] = useState<string | null>(null);
  if (openKey !== syncedShot) {
    setSyncedShot(openKey);
    if (open) {
      setExpanded(openRallyIndex);
      setDeck("rally");
    }
  }
  // Between rallies, analyze view keeps showing the rally that just ended.
  const focusIndex = openRallyIndex >= 0 ? openRallyIndex : selectedIndex >= 0 ? selectedIndex : Math.max(0, previousTarget);
  const focusRally = rallies[focusIndex];
  const shots = analysis?.rallies[focusRally.id]?.shots ?? [];
  // A shot becomes current SHOT_LEAD_SECONDS before contact, matching where a shot's video cue lands.
  // Before the serve, show the first shot so the detail panel is never empty.
  const activeShot = shots.length ? Math.max(0, activeShotIndex(shots, sourceTime + SHOT_LEAD_SECONDS)) : -1;

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
      setNativeFullscreen(document.fullscreenElement === viewerRef.current);
      setPanelOpen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  // Window-filling fallback: the page behind must not scroll, and Escape leaves it like real fullscreen.
  useEffect(() => {
    if (!immersive) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !panelOpen) setImmersive(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [immersive, panelOpen]);

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
          onStateChange: ({ data }) => {
            if (cancelled) return;
            if (data === PlayerState.playing && shotOpenRef.current) {
              instance?.pauseVideo();
              return;
            }
            setIsPlaying(data === PlayerState.playing || data === PlayerState.buffering);
          },
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
        const target = rallyPlaybackPosition(segments, time);
        if (target.ended) player.pauseVideo();
        if (Math.abs(target.time - time) > 0.25) {
          pendingSeekRef.current = { time: target.time, startedAt: performance.now() };
          player.seekTo(target.time, true);
        }
        setSourceTime(target.time);
        return;
      }
      setSourceTime(normalizeMediaTime(segments, time));
    }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [ready, skipGaps, segments]);

  // Opening a shot pauses the hidden video and cues it at that shot, so "Back to video" shows the real
  // stroke. Waits for the player, so a shot opened from a shared link is cued once it is ready.
  const cueKey = open && ready ? openKey : null;
  useEffect(() => {
    shotOpenRef.current = open !== null;
  });
  useEffect(() => {
    const player = youtubeRef.current;
    if (!cueKey || !open || !player) return;
    seek(shotCueTime(rallyStart(rallies[openRallyIndex]), open.shot), true);
    // Only a newly opened shot cues the video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

  useEffect(() => {
    const time = searchCueRef.current;
    searchCueRef.current = null;
    // A shot opened since then cues the video itself.
    if (ready && time !== null && !openRef) seek(time, true);
    // Only the player becoming ready applies a waiting cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function seek(time: number, paused = false) {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    const clamped = Math.max(0, Math.min(time, duration));
    pendingSeekRef.current = { time: clamped, startedAt: performance.now() };
    if (paused) cuePaused(player, clamped);
    else player.seekTo(clamped, true);
    setSourceTime(normalizeMediaTime(segments, clamped));
  }

  function selectRally(index: number) {
    const rally = rallies[index];
    if (rally) seek(rallyStart(rally));
  }

  /** After picking something from a list below the video, bring the video back into view. */
  function revealStage() {
    // Next frame: the pick may also change the layout above the video (search suggestions closing).
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage || viewerRef.current?.hasAttribute("data-fullscreen")) return;
      const { top, bottom } = stage.getBoundingClientRect();
      if (top >= 0 && bottom <= window.innerHeight) return;
      window.scrollTo({ top: window.scrollY + top - 8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }

  function playRally(index: number) {
    selectRally(index);
    revealStage();
  }

  function openShot(ref: ShotRef) {
    setOpenShot(ref);
  }

  function openSearchResult(result: SearchResult) {
    if (result.kind === "shot" && result.shotIndex !== null) setOpenShot({ rallyId: result.rallyId, index: result.shotIndex });
    else {
      showRally(result.rallyIndex);
      if (!ready) searchCueRef.current = rallyStart(rallies[result.rallyIndex]);
    }
    revealStage();
  }

  /** Back to the video, with focus returned to the closed shot's row in the rail. */
  function closeShot() {
    const ref = open?.ref ?? openRef;
    setOpenShot(null);
    if (ref) panelRef.current?.querySelector<HTMLElement>(`[data-shot="${formatShotParam(ref)}"]`)?.focus({ preventScroll: true });
  }

  function openFocusShot(index: number) {
    openShot({ rallyId: focusRally.id, index });
  }

  /** Sidebar rally row: expand it and play from its start, or collapse it (closing any open shot). */
  function toggleRally(index: number) {
    if (index === expanded) {
      setExpanded(null);
      if (openRef) setOpenShot(null);
      return;
    }
    showRally(index);
  }

  function showRally(index: number) {
    if (openRef) setOpenShot(null);
    setExpanded(index);
    setDeck("rally");
    playRally(index);
  }

  function showMatchSummary() {
    if (openRef) setOpenShot(null);
    setDeck("match");
  }

  function togglePlayback() {
    const player = youtubeRef.current;
    if (!player || !ready) return;
    const state = player.getPlayerState();
    if (state === PlayerState.playing || state === PlayerState.buffering) player.pauseVideo();
    else {
      if (skipGaps) {
        const target = rallyPlaybackPosition(segments, pendingSeekRef.current?.time ?? player.getCurrentTime());
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
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (immersive) {
      setImmersive(false);
      setPanelOpen(false);
      return;
    }
    if (document.fullscreenElement === viewer) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (typeof viewer.requestFullscreen === "function") {
      try {
        await viewer.requestFullscreen();
        // A match is wider than it is tall: turn a phone sideways where the browser allows it.
        const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
        orientation?.lock?.("landscape").catch(() => {});
        return;
      } catch { /* fall through to the window-filling view */ }
    }
    setPanelOpen(false);
    setImmersive(true);
  }

  const games = rallies.reduce<{ game: number; indices: number[] }[]>((groups, rally, index) => {
    const last = groups.at(-1);
    if (last && last.game === rally.game) last.indices.push(index);
    else groups.push({ game: rally.game, indices: [index] });
    return groups;
  }, []);

  return (
    <section ref={viewerRef} id="viewer" className={styles.viewer} aria-label="Match viewer" data-playing={isPlaying || undefined}
      data-fullscreen={isFullscreen || undefined} data-immersive={immersive || undefined}>
      <div className={styles.toolbar}>
        {hasAnalysis && <ViewSwitch />}
        <SearchPanel matchId={match.matchId} onSelect={openSearchResult} />
      </div>
      <div className={styles.workspace}>
        <div ref={stageRef} className={styles.stageColumn} data-replay={open || pendingShot ? true : undefined}>
        <div className={styles.stage}>
          <div ref={mountRef} className={styles.embed} title={match.title} />
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
        {open && (
          <ShotStage match={match} shot={open.shot} index={open.ref.index} count={shots.length}
            onStep={openFocusShot} onClose={closeShot} />
        )}
        {pendingShot && <div className={styles.stageLoading} role="status">Loading 3D replay…</div>}
        </div>
        <aside ref={panelRef} id={panelId} className={styles.rallyPanel} hidden={isFullscreen && !panelOpen} role={isFullscreen ? "dialog" : undefined} aria-labelledby={analyzing ? undefined : `${panelId}-heading`} aria-label={analyzing ? "Analysis" : undefined}>
          {analyzing ? (
            <MatchRail match={match} analysis={analysis} analysisError={analysisError} current={focusIndex} playing={isPlaying} ready={ready}
              expanded={expanded} liveShot={activeShot} openShot={open?.ref ?? null} onToggleRally={toggleRally} onOpenShot={openShot}
              onMatchSummary={showMatchSummary} matchSummaryActive={deck === "match" && !open} />
          ) : <>
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
            <div className={styles.columnLabels} aria-hidden="true"><span>Score before</span><span>Start</span><span>Length</span></div>
          </div>
          <div ref={listRef} className={styles.listScroll}>
            {games.map(({ game, indices }) => (
              <section key={game} aria-labelledby={`${panelId}-game-${game}`}>
                <h3 id={`${panelId}-game-${game}`} className={styles.gameHeading}><span>Game {game}</span><span>{indices.length} {indices.length === 1 ? "rally" : "rallies"}</span></h3>
                <ol className={styles.rallyList}>
                  {indices.map((index) => {
                    const rally = rallies[index];
                    const isSelected = selectedIndex === index;
                    const score = rally.scoreBefore && [rally.scoreBefore[scoreFirst], rally.scoreBefore[scoreSecond]];
                    return (
                      <Fragment key={rally.id}>
                      {missingBefore[index] > 0 && <li className={styles.gapRow}>{missingPointsLabel(missingBefore[index], match.review)}</li>}
                      <li>
                        <button type="button" disabled={!ready} data-selected={isSelected || undefined} className={styles.rallyRow} aria-current={isSelected ? "true" : undefined} aria-label={`Game ${rally.game}, ${score ? `score ${score.join(" to ")}` : "score unknown"}, ${formatTime(rallyStart(rally))} in original video`} onClick={() => playRally(index)}>
                          <span className={styles.rallyScore}>{score ? <><span>{score[0]}</span><span className={styles.scoreDash}>–</span><span>{score[1]}</span></> : <span className={styles.scoreDash}>No score</span>}{isSelected && isPlaying && <span className={styles.equalizer} aria-hidden="true"><i /><i /><i /></span>}</span>
                          <span className={styles.rallyStart}>{formatTime(rallyStart(rally))}</span>
                          <span className={styles.rallyDuration}>{Math.round(rallySeconds(rally))}s</span>
                        </button>
                      </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
          </>}
        </aside>
        {/* On a phone, what was picked (a rally or a shot) reads directly under the video, ahead of the list. */}
        {analyzing && (
          <div className={styles.deckArea} data-picked={open || deck === "rally" ? true : undefined}>
            <AnalysisDeck deck={deck} openShot={open ? { shot: open.shot, index: open.ref.index } : null} match={match} analysis={analysis}
              rally={focusRally} rallyIndex={focusIndex} shots={shots} activeIndex={activeShot} time={sourceTime}
              onSelectRally={showRally} onSelectShot={openFocusShot} />
          </div>
        )}
      </div>
      {missingTotal > 0 && (
        <p className={styles.previewNotice}>
          {missingTotal} of {rallies.length + missingTotal} points {missingPointsReason(match.review)}. Gaps are marked in the list.
        </p>
      )}
      {match.review === "automatic" && <p className={styles.previewNotice}>Rally boundaries and scores were detected automatically and haven’t been reviewed by hand.</p>}
    </section>
  );
}
