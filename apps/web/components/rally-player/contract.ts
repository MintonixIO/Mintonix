import { z } from "zod";

/**
 * The match data the app reads, defined once. `contracts/*.schema.json` is
 * generated from these schemas (`pnpm contracts`); a test keeps them in sync.
 * Cross-field rules JSON Schema cannot express are checked in `parseMatch`
 * and `parseAnalysis`.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const seconds = z.number().nonnegative();
const metres = z.number();
const point3 = z.tuple([metres, metres, metres]);

export const playerSchema = z.object({
  id: id.describe("Stable player id used by scores, servers, winners and shots"),
  name: z.string().trim().min(1),
}).strict().meta({ id: "Player" });

export const rallySchema = z.object({
  id: id.describe("Stable rally id within the match"),
  game: z.int().min(1).max(3),
  segments: z.array(z.tuple([seconds, seconds]))
    .min(1)
    .describe("Watchable [start, end) intervals in source-video seconds; camera cuts and replays inside a rally are left out"),
  scoreBefore: z.record(id, z.int().nonnegative()).optional()
    .describe("Each player's score before the rally, keyed by player id"),
  server: id.optional(),
  winner: id.optional(),
}).strict();

export const matchSchema = z.object({
  version: z.literal(3),
  matchId: id,
  title: z.string().trim().min(1),
  players: z.tuple([playerSchema, playerSchema]),
  source: z.object({
    provider: z.literal("youtube"),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    durationSeconds: z.number().positive(),
  }).strict().describe("The published video every timestamp refers to. Playback embeds it; media is never re-hosted."),
  review: z.enum(["automatic", "reviewed"])
    .describe("automatic: produced by the engine and not checked by hand; reviewed: rally boundaries and scores checked by hand"),
  rallies: z.array(rallySchema).min(1),
}).strict().meta({ title: "Mintonix match v3" });

const distribution = z.object({
  n: z.int().nonnegative(),
  median: z.number().optional(),
  p10: z.number().optional(),
  p90: z.number().optional(),
  max: z.number().optional(),
}).strict().meta({ id: "Distribution" });

const contact = z.enum(["racket", "net", "ground"]);

export const shotSchema = z.object({
  hitter: id.nullable().describe("Player id; null for a net-cord continuation"),
  startSeconds: seconds,
  endSeconds: seconds,
  startContact: z.enum(["racket", "net"]),
  endContact: contact.nullable(),
  speed: z.number().nullable().describe("Launch speed, m/s"),
  arrivalSpeed: z.number().nullable().describe("Speed at the next contact, m/s"),
  contact: point3.describe("Contact point, court metres: x across (0–6.10), y from the far baseline (0) to the camera baseline (13.40), z up"),
  end: point3,
  apex: z.number().nullable().describe("Highest point, m"),
  netClearance: z.number().nullable().describe("Height above the 1.524 m net top where the path crosses the net, m"),
  launchAngle: z.number().nullable().describe("Degrees above horizontal; negative is downward"),
  descentAngle: z.number().nullable(),
  hitterEnd: z.enum(["near", "far"]).describe("near: the end nearest the broadcast camera"),
  placement: z.tuple([metres, metres]).describe("End point seen with the hitter at the camera end"),
  quality: z.enum(["ok", "guessed", "unreliable"]),
  issues: z.array(z.string()),
  path: z.array(z.tuple([seconds, metres, metres, metres])).describe("[seconds, x, y, z] samples; empty when the 3D fit failed"),
}).strict().meta({ id: "Shot" });

export const playerAnalysisSchema = z.object({
  shots: z.int().nonnegative(),
  okShots: z.int().nonnegative(),
  speed: distribution,
  apex: distribution,
  contactHeight: distribution,
  netClearance: distribution,
  placements: z.array(z.tuple([metres, metres, metres, contact.nullable()])),
  pointsWon: z.int().nonnegative(),
  pointsWithKnownWinner: z.int().nonnegative(),
  serves: z.int().nonnegative(),
  pointsWonOnServe: z.int().nonnegative(),
}).strict();

export const analysisSchema = z.object({
  version: z.literal(1),
  matchId: id,
  quality: z.object({
    shots: z.int().nonnegative(),
    ok: z.int().nonnegative(),
    guessed: z.int().nonnegative(),
    unreliable: z.int().nonnegative(),
  }).strict(),
  rallies: z.record(id, z.object({ shots: z.array(shotSchema) }).strict())
    .describe("Shots per rally, keyed by rally id"),
  players: z.record(id, playerAnalysisSchema).describe("Per-player summaries over ok shots, keyed by player id"),
}).strict().meta({ title: "Mintonix match analysis v1" });

export type Player = z.infer<typeof playerSchema>;
export type Rally = z.infer<typeof rallySchema>;
export type Match = z.infer<typeof matchSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type MatchAnalysis = z.infer<typeof analysisSchema>;

function fail(message: string): never {
  throw new Error(message);
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "(root)"}: ${issue.message}`;
}

/** Validate a match file: shape, then the temporal and reference rules. */
export function parseMatch(input: unknown): Match {
  const parsed = matchSchema.safeParse(input);
  if (!parsed.success) fail(`Invalid match: ${firstIssue(parsed.error)}`);
  const match = parsed.data;
  const playerIds = match.players.map((player) => player.id);
  if (playerIds[0] === playerIds[1]) fail("Invalid match: player ids must differ");
  const rallyIds = new Set<string>();
  let previousEnd = 0;
  let previousGame = 1;
  for (const rally of match.rallies) {
    if (rallyIds.has(rally.id)) fail(`Invalid match: duplicate rally id ${rally.id}`);
    rallyIds.add(rally.id);
    if (rally.game < previousGame) fail(`Invalid match: game number moves backward at ${rally.id}`);
    previousGame = rally.game;
    for (const [start, end] of rally.segments) {
      if (start < previousEnd || end <= start || end > match.source.durationSeconds) {
        fail(`Invalid match: segments must be chronological, non-overlapping and within the source (${rally.id})`);
      }
      previousEnd = end;
    }
    if (rally.scoreBefore) {
      const keys = Object.keys(rally.scoreBefore);
      if (keys.length !== 2 || !playerIds.every((player) => keys.includes(player))) {
        fail(`Invalid match: scoreBefore must have one score per player (${rally.id})`);
      }
    }
    for (const role of ["server", "winner"] as const) {
      const value = rally[role];
      if (value !== undefined && !playerIds.includes(value)) fail(`Invalid match: unknown ${role} ${value} (${rally.id})`);
    }
  }
  return match;
}

/** Validate an analysis file against the match it belongs to. */
export function parseAnalysis(input: unknown, match: Match): MatchAnalysis {
  const parsed = analysisSchema.safeParse(input);
  if (!parsed.success) fail(`Invalid analysis: ${firstIssue(parsed.error)}`);
  const analysis = parsed.data;
  if (analysis.matchId !== match.matchId) fail("Invalid analysis: match id differs from its match");
  const playerIds = match.players.map((player) => player.id);
  const rallies = new Map(match.rallies.map((rally) => [rally.id, rally]));
  for (const [rallyId, { shots }] of Object.entries(analysis.rallies)) {
    const rally = rallies.get(rallyId) ?? fail(`Invalid analysis: unknown rally ${rallyId}`);
    const start = rally.segments[0][0];
    const end = rally.segments.at(-1)![1];
    let previous = start;
    for (const shot of shots) {
      if (shot.hitter !== null && !playerIds.includes(shot.hitter)) fail(`Invalid analysis: unknown hitter ${shot.hitter}`);
      if (shot.startSeconds < previous || shot.endSeconds <= shot.startSeconds || shot.endSeconds > end) {
        fail(`Invalid analysis: shots must be chronological and inside their rally (${rallyId})`);
      }
      previous = shot.startSeconds;
    }
  }
  for (const player of Object.keys(analysis.players)) {
    if (!playerIds.includes(player)) fail(`Invalid analysis: unknown player ${player}`);
  }
  return analysis;
}
