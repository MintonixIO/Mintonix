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
import { ControlBar } from "./control-bar";
import { Icon } from "./icons";
import styles from "./rally-player.module.css";

// three.js is only fetched when a shot is first opened.
const ShotStage = dynamic(() => import("./analysis/shot-stage"), {
  ssr: false,
  loading: () => <div className={styles.stageLoading} role="status">Loading 3D replay…</div>,
});

// The live court's three.js is only fetched for matches with player skeletons, outside the analyze view.
const LiveCourt = dynamic(() => import("./live-court/live-court"), { ssr: false });

const SYNC_INTERVAL_MS = 100;
const DURATION_TOLERANCE_SECONDS = 2;
const COURT_MINIMIZED_KEY = "mintonix.courtMinimized";

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
  // The analyze rail beside the video (its shot rows take focus back when a replay closes).
  const panelRef = useRef<HTMLElement>(null);
  // The rally list drawer, and the control bar button that opens it.
  const drawerRef = useRef<HTMLElement>(null);
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
  // Each viewer's choice, restored after mount; the court is never minimized by default.
  const [courtMinimized, setCourtMinimized] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // Where the Fullscreen API can't take an element (iPhone Safari), the viewer fills the window instead.
  const [immersive, setImmersive] = useState(false);
  const isFullscreen = nativeFullscreen || immersive;
  const [mediaError, setMediaError] = useState("");
  const selectedIndex = rallyIndexAt(rallies, sourceTime);
  const nextIndex = rallies.findIndex((rally) => rallyStart(rally) > sourceTime);
  const previousTarget = selectedIndex >= 0 ? selectedIndex - 1 : (nextIndex === -1 ? rallies.length : nextIndex) - 1;
  const nextTarget = selectedIndex >= 0 ? selectedIndex + 1 : nextIndex;
  const { videoId, durationSeconds: duration } = match.source;
  const firstStart = rallyStart(rallies[0]);
  const [scoreFirst, scoreSecond] = match.players.map((player) => player.id);
  const view = useView(hasAnalysis);
  const analyzing = view === "analyze" && !isFullscreen;
  // The live court: beside the video for matches with skeletons, in fullscreen too, except in the analyze view.
  const liveCourt = !analyzing && match.poses !== undefined;
  // The rally list drawer belongs to the watch layout; analyze lists rallies in its rail.
  const listOpen = panelOpen && !analyzing;
  // Beside the video: the analyze rail, the court, the court minimized to a rail, or nothing.
  // An open rally list always takes a full column, so it never covers the video.
  const layout = analyzing || listOpen || (liveCourt && !courtMinimized) ? "split" : liveCourt ? "rail" : "single";
  // Its hit tags need the shot data, fetched after the page has loaded.
  const { analysis, error: analysisError } = useAnalysis(match.matchId, view === "analyze" || (liveCourt && hasAnalysis));
  // The shot open in the 3D replay comes from the URL; it shows only once the analysis has it.
  const openRef = useOpenShot();
  const open = analyzing ? resolveShot(analysis, openRef) : null;
  const openRallyIndex = open ? rallies.findIndex((rally) => rally.id === open.ref.rallyId) : -1;
  const pendingShot = analyzing && openRef !== null && !analysis && !analysisError;
  // Below the video: the match overview, or the rally last picked in the sidebar.
  const [deck, setDeck] = useState<"match" | "rally">("match");
  const [expanded, setExpanded] = useState<number | null>(null);
  // A shot opened from the match summary's explorer goes back to the summary when closed.
  const [backToSummary, setBackToSummary] = useState(false);
  // The explorer mark to focus once a shot opened from it has closed and the summary is back.
  const explorerFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (open || !explorerFocusRef.current) return;
    document.querySelector<HTMLElement>(`[data-explorer-shot="${explorerFocusRef.current}"]`)?.focus({ preventScroll: true });
    explorerFocusRef.current = null;
  }, [open]);
  // A newly opened shot (including one from a shared link) expands its rally.
  const openKey = open ? formatShotParam(open.ref) : null;
  const [syncedShot, setSyncedShot] = useState<string | null>(null);
  if (openKey !== syncedShot) {
    setSyncedShot(openKey);
    if (open) {
      setExpanded(openRallyIndex);
      if (!backToSummary) setDeck("rally");
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
  }, [selectedIndex, listOpen]);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (window.localStorage.getItem(COURT_MINIMIZED_KEY) === "1") setCourtMinimized(true);
    } catch { /* storage unavailable: keep the court shown */ }
  }, []);

  function toggleCourt() {
    const next = !courtMinimized;
    setCourtMinimized(next);
    try {
      if (next) window.localStorage.setItem(COURT_MINIMIZED_KEY, "1");
      else window.localStorage.removeItem(COURT_MINIMIZED_KEY);
    } catch { /* storage unavailable: the choice lasts for this visit */ }
  }

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
      if (event.key === "Escape" && !listOpen) setImmersive(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [immersive, listOpen]);

  // An opened rally list takes focus, and Escape closes it back to the button that opened it.
  useEffect(() => {
    if (!listOpen) return;
    drawerRef.current?.querySelector<HTMLButtonElement>("[data-close]")?.focus({ preventScroll: true });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [listOpen]);

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
    setBackToSummary(false);
    setOpenShot(ref);
  }

  /** From the match summary: open the shot in the replay, and come back to the summary when it closes. */
  function openSummaryShot(ref: ShotRef) {
    setBackToSummary(true);
    setDeck("match");
    setOpenShot(ref);
    revealStage();
  }

  function openSearchResult(result: SearchResult) {
    if (result.kind === "shot" && result.shotIndex !== null) openShot({ rallyId: result.rallyId, index: result.shotIndex });
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
    if (!ref) return;
    if (backToSummary) {
      // The summary renders again after this update; the effect above returns focus to the shot's mark.
      setBackToSummary(false);
      explorerFocusRef.current = formatShotParam(ref);
      return;
    }
    panelRef.current?.querySelector<HTMLElement>(`[data-shot="${formatShotParam(ref)}"]`)?.focus({ preventScroll: true });
  }

  /** Step to another shot of the open rally; Back still returns to wherever the first shot was opened from. */
  function openFocusShot(index: number) {
    setOpenShot({ rallyId: focusRally.id, index });
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

  const courtRally = selectedIndex >= 0 ? selectedIndex : previousTarget;

  return (
    <section ref={viewerRef} id="viewer" className={styles.viewer} aria-label="Match viewer" data-playing={isPlaying || undefined}
      data-fullscreen={isFullscreen || undefined} data-immersive={immersive || undefined}>
      <div className={styles.toolbar}>
        {hasAnalysis && <ViewSwitch />}
        <SearchPanel matchId={match.matchId} onSelect={openSearchResult} />
      </div>
      {/* The video and, beside it, the court or the analyze rail; then the control bar. Nothing is drawn over the video. */}
      <div className={styles.workspace} data-layout={layout}>
        <div ref={stageRef} className={styles.stageColumn} data-replay={open || pendingShot ? true : undefined}>
          <div className={styles.stage}>
            <div ref={mountRef} className={styles.embed} title={match.title} />
            {mediaError && <p className={styles.mediaError} role="alert">{mediaError}</p>}
          </div>
          {open && (
            <ShotStage match={match} shot={open.shot} index={open.ref.index} count={shots.length}
              onStep={openFocusShot} onClose={closeShot} />
          )}
          {pendingShot && <div className={styles.stageLoading} role="status">Loading 3D replay…</div>}
        </div>

        {analyzing ? (
          <aside ref={panelRef} className={styles.side} aria-label="Analysis">
            <MatchRail match={match} analysis={analysis} analysisError={analysisError} current={focusIndex} playing={isPlaying} ready={ready}
              expanded={expanded} liveShot={activeShot} openShot={open?.ref ?? null} onToggleRally={toggleRally} onOpenShot={openShot}
              onMatchSummary={showMatchSummary} matchSummaryActive={deck === "match" && !open} />
          </aside>
        ) : liveCourt && (
          <div className={styles.side} data-minimized={courtMinimized || undefined}>
            <LiveCourt match={match} rallyIndex={courtRally} time={sourceTime} playing={isPlaying} shots={shots}
              minimized={courtMinimized} onToggleMinimized={toggleCourt} />
          </div>
        )}

        {!analyzing && (
          <aside ref={drawerRef} id={panelId} className={styles.drawer} hidden={!listOpen} role="dialog" aria-labelledby={`${panelId}-heading`}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <h2 id={`${panelId}-heading`}>Rallies <span className={styles.rallyCount}>{rallies.length}</span></h2>
                <button data-close type="button" className={styles.iconButton} aria-label="Close rallies" onClick={closePanel}><Icon name="close" /></button>
              </div>
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
          </aside>
        )}

        <div className={styles.controls}>
          <ControlBar match={match} missingBefore={missingBefore} selectedIndex={selectedIndex} time={sourceTime}
            ready={ready} playing={isPlaying} muted={muted} skipGaps={skipGaps}
            canPrevious={Boolean(rallies[previousTarget])} canNext={Boolean(rallies[nextTarget])} isFullscreen={isFullscreen}
            court={liveCourt ? (courtMinimized ? "minimized" : "shown") : null} listOpen={analyzing ? null : listOpen}
            listId={panelId} listButtonRef={triggerRef}
            onPlay={togglePlayback} onPrevious={() => selectRally(previousTarget)} onNext={() => selectRally(nextTarget)}
            onSelectRally={selectRally} onMute={toggleMute} onSkipGaps={setSkipGaps} onCourt={toggleCourt}
            onList={() => { if (listOpen) closePanel(); else setPanelOpen(true); }} onFullscreen={() => { void toggleFullscreen(); }} />
        </div>

        {/* On a phone, what was picked (a rally or a shot) reads directly under the controls, ahead of the rail. */}
        {analyzing && (
          <div className={styles.deckArea} data-picked={open || deck === "rally" ? true : undefined}>
            <AnalysisDeck deck={deck} openShot={open ? { shot: open.shot, index: open.ref.index } : null} match={match} analysis={analysis}
              rally={focusRally} rallyIndex={focusIndex} shots={shots} activeIndex={activeShot} time={sourceTime}
              onSelectRally={showRally} onSelectShot={openFocusShot} onOpenSummaryShot={openSummaryShot} />
          </div>
        )}
      </div>
      {liveCourt && <p className={`${styles.previewNotice} ${styles.courtNotice}`}>3D estimate from the broadcast, not checked by hand. Distance run this rally; stroke types are a model’s inference.</p>}
      {missingTotal > 0 && (
        <p className={styles.previewNotice}>
          {missingTotal} of {rallies.length + missingTotal} points {missingPointsReason(match.review)}. Gaps are marked in the rally list.
        </p>
      )}
      {match.review === "automatic" && <p className={styles.previewNotice}>Rally boundaries and scores were detected automatically and haven’t been reviewed by hand.</p>}
    </section>
  );
}
