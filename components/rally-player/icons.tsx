export type IconName = "play" | "pause" | "volume" | "muted" | "previous" | "next" | "expand" | "collapse" | "list" | "close" | "court" | "chevronLeft" | "chevronRight";

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
  court: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm9 0v14",
  chevronLeft: "m15 6-6 6 6 6",
  chevronRight: "m9 6 6 6-6 6",
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}
