"use client";

import { useCallback, useRef, useState } from "react";
import { formatTime, normalizeMediaTime, rallyPlaybackPosition, type RallyManifest } from "./timeline";
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

export function RallyPlayer({ manifest, videoSrc }: { manifest: RallyManifest; videoSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
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
  const duration = manifest.sourceDurationSeconds;
  const progress = Math.min(100, Math.max(0, sourceTime / duration * 100));
  const firstStart = rallies[0].startSeconds;

  const initializeVideo = useCallback((video: HTMLVideoElement) => {
    if (Math.abs(video.duration - duration) > 0.25) {
      setMediaError("The video duration does not match the detected timeline.");
      return;
    }
    video.currentTime = firstStart;
    setReady(true);
  }, [duration, firstStart]);

  // Metadata may arrive before hydration for a fast local source. Initialize
  // from the DOM's existing state as well as the loadedmetadata event.
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video && video.readyState >= 1) initializeVideo(video);
  }, [initializeVideo]);

  function seek(time: number) {
    const video = videoRef.current;
    if (!video || !ready) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
    setSourceTime(normalizeMediaTime(rallies, video.currentTime));
  }

  function selectRally(index: number) {
    const rally = rallies[index];
    if (rally) seek(rally.startSeconds);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (skipGaps) {
      const target = rallyPlaybackPosition(rallies, video.currentTime);
      seek(target.ended ? rallies[0].startSeconds : target.time);
    } else if (video.ended) {
      seek(0);
    }
    try {
      await video.play();
      setMediaError("");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setMediaError("Playback could not start. Try playing the video again.");
    }
  }

  function syncTime(video: HTMLVideoElement) {
    if (!video.paused && !video.seeking && skipGaps) {
      const target = rallyPlaybackPosition(rallies, video.currentTime);
      if (target.ended) video.pause();
      if (Math.abs(target.time - video.currentTime) > 0.02) video.currentTime = target.time;
      setSourceTime(target.time);
      return;
    }
    setSourceTime(normalizeMediaTime(rallies, video.currentTime));
  }

  return (
    <section id="viewer" className={styles.viewer} aria-labelledby="viewer-heading">
      <div className={styles.viewerTop}>
        <div className={styles.viewerHeading}>
          <span className={styles.smallMark} aria-hidden="true">↳</span>
          <h2 id="viewer-heading">The rally player</h2>
          <span className={styles.headingDivider} />
          <span className={styles.sampleLabel}>{manifest.matchId}</span>
        </div>
        <span className={styles.previewLabel}>DETECTED RALLIES</span>
      </div>

      <div className={styles.workspace}>
        <div ref={playerRef} className={styles.playerColumn}>
          <div className={`${styles.poster} ${styles.videoPoster}`}>
            <video
              ref={attachVideo}
              className={styles.video}
              src={videoSrc}
              preload="metadata"
              playsInline
              aria-label={manifest.title}
              onLoadedMetadata={(event) => initializeVideo(event.currentTarget)}
              onTimeUpdate={(event) => syncTime(event.currentTarget)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => { setReady(false); setIsPlaying(false); setMediaError("The match video could not be loaded."); }}
            />
            {!isPlaying && ready && !mediaError && <div className={styles.playOverlay}><button type="button" className={styles.previewPlay} onClick={togglePlayback} aria-label="Play match video"><Icon name="play" /></button></div>}
            <div className={styles.posterBottom}>
              <span>{manifest.players.join(" · ")}</span>
              <span className={styles.rallyPill}>{selected ? `RALLY ${String(selectedIndex + 1).padStart(2, "0")}` : "BETWEEN RALLIES"}</span>
            </div>
          </div>
          {mediaError && <p className={styles.mediaError} role="alert">{mediaError}</p>}

          <div className={styles.controls}>
            <div className={styles.transport}>
              <div className={styles.transportLeft}>
                <button type="button" className={styles.playButton} disabled={!ready} aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback}><Icon name={isPlaying ? "pause" : "play"} /></button>
                <button type="button" className={styles.iconButton} aria-label="Previous rally" disabled={!ready || !rallies[previousTarget]} onClick={() => selectRally(previousTarget)}><Icon name="previous" /></button>
                <button type="button" className={styles.iconButton} aria-label="Next rally" disabled={!ready || !rallies[nextTarget]} onClick={() => selectRally(nextTarget)}><Icon name="next" /></button>
                <span className={styles.timeReadout}><span>{formatTime(sourceTime)}</span><span className={styles.timeDivider}>/</span>{formatTime(duration)}</span>
              </div>
              <div className={styles.transportRight}>
                <button type="button" className={styles.iconButton} disabled={!ready} aria-label="Fullscreen video" onClick={() => { void playerRef.current?.requestFullscreen().catch(() => setMediaError("Fullscreen is unavailable in this browser.")); }}><Icon name="expand" /></button>
              </div>
            </div>

            <div className={styles.timelineHead}>
              <label className={styles.gapToggle}><input type="checkbox" checked={skipGaps} onChange={(event) => setSkipGaps(event.target.checked)} />Skip gaps</label>
              <span className={styles.timelineHint}>Original video timeline</span>
            </div>
            <div className={styles.timeline}>
              <div className={styles.segments} aria-hidden="true">
                {rallies.map((rally, index) => <span key={rally.id} className={index === selectedIndex ? styles.activeSegment : styles.segment} style={{ left: `${rally.startSeconds / duration * 100}%`, width: `${(rally.endSeconds - rally.startSeconds) / duration * 100}%` }} />)}
                <span className={styles.playhead} style={{ left: `${progress}%` }} />
              </div>
              <input type="range" min={0} max={duration} step={0.01} value={sourceTime} disabled={!ready} onChange={(event) => seek(Number(event.target.value))} aria-label="Original video timeline" aria-valuetext={`${formatTime(sourceTime)} of ${formatTime(duration)}${selected ? `, rally ${selectedIndex + 1}` : ", between rallies"}`} />
            </div>
            <div className={styles.timelineLabels}><span>0:00</span><span>{formatTime(duration / 4)}</span><span>{formatTime(duration / 2)}</span><span>{formatTime(duration * .75)}</span><span>{formatTime(duration)}</span></div>
          </div>
        </div>

        <aside className={styles.rallyPanel} aria-labelledby="rallies-heading">
          <div className={styles.panelHeader}><div><h3 id="rallies-heading">Jump to a rally</h3><p>Find your moment by the score.</p></div><span className={styles.rallyCount}>{rallies.length}</span></div>
          <div className={styles.listHeader}><span>{selected ? `GAME ${selected.game}` : "RALLIES"}</span><span>SCORE BEFORE RALLY</span></div>
          <ol className={styles.rallyList} aria-label="Detected rallies">
            {rallies.map((rally, index) => (
              <li key={rally.id}>
                <button type="button" disabled={!ready} className={`${styles.rallyRow} ${selectedIndex === index ? styles.selectedRow : ""}`} aria-current={selectedIndex === index ? "true" : undefined} aria-label={`Rally ${index + 1}, game ${rally.game}, ${rally.scoreBefore ? `score ${rally.scoreBefore.join(" to ")}` : "score unknown"}, ${formatTime(rally.startSeconds)} in original video`} onClick={() => selectRally(index)}>
                  <span className={styles.rallyNumber}>{selectedIndex === index ? <span className={styles.equalizer} aria-hidden="true"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.rallyScore}>{rally.scoreBefore ? <>{rally.scoreBefore[0]} <span>–</span> {rally.scoreBefore[1]}</> : "—"}</span>
                  <span className={styles.rallyDuration}>{Math.round(rally.endSeconds - rally.startSeconds)}s</span>
                  <span className={styles.rallyArrow} aria-hidden="true">↗</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div className={styles.previewNotice}>
        <span className={styles.noticeIcon} aria-hidden="true">i</span>
        <p><strong>Automatic detection.</strong> Rally boundaries and OCR score labels have not been manually reviewed.</p>
      </div>
    </section>
  );
}
