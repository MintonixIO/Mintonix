/** Source-video timestamps are canonical; gameplay time concatenates rallies. */
export type Rally = {
  id: string;
  game: number;
  startSeconds: number;
  endSeconds: number;
  scoreBefore?: readonly [number, number];
};

/** The published video every timestamp refers to. Playback embeds it; media is never re-hosted. */
export type VideoSource = {
  provider: "youtube";
  videoId: string;
  durationSeconds: number;
};

export type RallyManifest = {
  version: 2;
  matchId: string;
  title: string;
  players: readonly [string, string];
  source: VideoSource;
  rallies: readonly Rally[];
};

const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/;

export type TimelineRally = Rally & {
  gameplayStartSeconds: number;
  gameplayEndSeconds: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("Unexpected manifest property");
  }
}

/** Enforces the JSON schema shape plus temporal invariants JSON Schema cannot express. */
export function parseRallyManifest(input: unknown): RallyManifest {
  if (!isRecord(input)) throw new Error("Manifest must be an object");
  rejectUnknownKeys(input, ["version", "matchId", "title", "players", "source", "rallies"]);
  if (input.version !== 2) throw new Error("Unsupported manifest version");
  if (!nonemptyString(input.matchId) || !nonemptyString(input.title)) {
    throw new Error("Manifest needs a match ID and title");
  }
  if (!Array.isArray(input.players) || input.players.length !== 2 || !input.players.every(nonemptyString)) {
    throw new Error("Manifest needs two player names");
  }
  if (!isRecord(input.source)) throw new Error("Manifest needs a source video");
  rejectUnknownKeys(input.source, ["provider", "videoId", "durationSeconds"]);
  if (input.source.provider !== "youtube") throw new Error("Unsupported video provider");
  if (typeof input.source.videoId !== "string" || !youtubeVideoId.test(input.source.videoId)) {
    throw new Error("Source needs an 11-character YouTube video ID");
  }
  const duration = input.source.durationSeconds;
  if (!finiteNumber(duration) || duration <= 0) {
    throw new Error("Source duration must be a positive finite number");
  }
  if (!Array.isArray(input.rallies) || input.rallies.length === 0) {
    throw new Error("Manifest needs at least one rally");
  }

  const rallies: Rally[] = [];
  const ids = new Set<string>();
  let previousEnd = 0;
  let previousGame = 1;
  for (const row of input.rallies) {
    if (!isRecord(row)) throw new Error("Rally must be an object");
    rejectUnknownKeys(row, ["id", "game", "startSeconds", "endSeconds", "scoreBefore"]);
    if (!nonemptyString(row.id) || ids.has(row.id)) throw new Error("Rally IDs must be nonempty and unique");
    if (!finiteNumber(row.game) || !Number.isInteger(row.game) || row.game < previousGame || row.game > 3) {
      throw new Error("Game numbers must be 1–3 and must not move backward");
    }
    if (!finiteNumber(row.startSeconds) || !finiteNumber(row.endSeconds)
      || row.startSeconds < previousEnd || row.endSeconds <= row.startSeconds
      || row.endSeconds > duration) {
      throw new Error("Rallies must be chronological, non-overlapping intervals within the source");
    }
    let scoreBefore: Rally["scoreBefore"];
    if (row.scoreBefore !== undefined) {
      if (!Array.isArray(row.scoreBefore) || row.scoreBefore.length !== 2
        || !row.scoreBefore.every((score) => finiteNumber(score) && Number.isInteger(score) && score >= 0)) {
        throw new Error("Score must contain two nonnegative integers");
      }
      scoreBefore = [row.scoreBefore[0], row.scoreBefore[1]];
    }
    rallies.push({ id: row.id, game: row.game, startSeconds: row.startSeconds, endSeconds: row.endSeconds, ...(scoreBefore ? { scoreBefore } : {}) });
    ids.add(row.id);
    previousEnd = row.endSeconds;
    previousGame = row.game;
  }
  return {
    version: 2, matchId: input.matchId, title: input.title,
    players: [input.players[0], input.players[1]],
    source: { provider: "youtube", videoId: input.source.videoId, durationSeconds: duration }, rallies,
  };
}

export function createTimeline(rallies: readonly Rally[]): TimelineRally[] {
  let elapsed = 0;
  return rallies.map((rally) => {
    const gameplayStartSeconds = elapsed;
    elapsed += rally.endSeconds - rally.startSeconds;
    return { ...rally, gameplayStartSeconds, gameplayEndSeconds: elapsed };
  });
}

function requirePosition(position: number) {
  if (!Number.isFinite(position)) throw new Error("Timeline position must be finite");
}

export function sourceAtGameplayTime(timeline: readonly TimelineRally[], position: number): number {
  requirePosition(position);
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  const clamped = Math.max(0, Math.min(position, last.gameplayEndSeconds));
  const rally = timeline.find((item) => clamped < item.gameplayEndSeconds) ?? last;
  return rally.startSeconds + clamped - rally.gameplayStartSeconds;
}

/** Source gaps map to the next rally's gameplay boundary; trailing time maps to the end. */
export function gameplayAtSourceTime(timeline: readonly TimelineRally[], position: number): number {
  requirePosition(position);
  for (const rally of timeline) {
    if (position < rally.startSeconds) return rally.gameplayStartSeconds;
    if (position < rally.endSeconds) return rally.gameplayStartSeconds + position - rally.startSeconds;
  }
  return timeline.at(-1)?.gameplayEndSeconds ?? 0;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** While playing, move through source gaps and stop at the last rally end. */
export function rallyPlaybackPosition(rallies: readonly Rally[], position: number) {
  position = normalizeMediaTime(rallies, position);
  for (const rally of rallies) {
    if (position < rally.startSeconds) return { time: rally.startSeconds, ended: false };
    if (position < rally.endSeconds) return { time: position, ended: false };
  }
  return { time: rallies.at(-1)?.endSeconds ?? 0, ended: true };
}

/** Browsers round currentTime to microseconds; restore exact frame boundaries. */
export function normalizeMediaTime(rallies: readonly Rally[], position: number) {
  requirePosition(position);
  for (const rally of rallies) {
    if (Math.abs(position - rally.startSeconds) <= 0.000001) return rally.startSeconds;
    if (Math.abs(position - rally.endSeconds) <= 0.000001) return rally.endSeconds;
  }
  return position;
}
