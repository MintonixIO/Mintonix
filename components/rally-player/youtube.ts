/** Minimal typing and a single shared loader for the YouTube IFrame Player API. */

export const PlayerState = { ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

export type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
};

/**
 * Seek while staying paused. `seekTo` starts playback from the unstarted or cued state, so a
 * hidden video (behind an open shot replay) is paused again after the seek.
 */
export function cuePaused(player: YouTubePlayer, time: number) {
  player.pauseVideo();
  player.seekTo(time, true);
  player.pauseVideo();
}

export type PendingSeek = { time: number; startedAt: number };

/** Ignore stale timestamps and keyframe pre-roll until the requested rally arrives. */
export function isSeekPending(seek: PendingSeek, sourceTime: number, now: number) {
  const elapsed = Math.max(0, now - seek.startedAt);
  if (elapsed >= 10_000) return false;
  return sourceTime < seek.time - 0.001 || sourceTime > seek.time + Math.max(1, elapsed / 1000 + 1);
}

type PlayerOptions = {
  videoId: string;
  host?: string;
  width?: string;
  height?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
};

type YouTubeNamespace = { Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer };

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | undefined;

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = undefined;
      reject(new Error("The YouTube player could not be loaded."));
    };
    document.head.append(script);
  });
  return apiPromise;
}

/** Messages for the IFrame API's documented error codes. */
export function describeYouTubeError(code: number) {
  if (code === 101 || code === 150) return "The video owner doesn’t allow this match to be played outside YouTube.";
  if (code === 100) return "This match video is no longer available on YouTube.";
  if (code === 2) return "The match video ID is invalid.";
  return "The YouTube player hit a playback error. Try playing the video again.";
}
