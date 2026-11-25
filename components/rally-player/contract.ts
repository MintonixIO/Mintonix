import { z } from "zod";

/**
 * The match data the app reads, defined once. A published match is a folder:
 * `metadata.json` (the match, each rally with its shots, the match analysis) and,
 * when the Engine reconstructed the players, one `<rallyId>.json` per rally (both
 * players' skeletons and running distance). `contracts/*.schema.json` is generated
 * from `metadataSchema` and `rallyMotionSchema` (`pnpm contracts`); a test keeps them
 * in sync. In memory, metadata splits into a `Match` and an optional `MatchAnalysis`.
 * Cross-field rules JSON Schema cannot express are checked in `parseMetadata`
 * (through `parseMatch` and `parseAnalysis`) and `parseRallyMotion`.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const seconds = z.number().nonnegative();
const metres = z.number();
const point3 = z.tuple([metres, metres, metres]);

export const playerSchema = z.object({
  id: id.describe("Stable player id used by scores, servers, winners and shots"),
  name: z.string().trim().min(1),
  hand: z.enum(["left", "right"]).optional()
    .describe("The hand that holds the racket, labelled by hand in the Engine; absent when unlabelled"),
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

const heightSource = z.enum(["supplied", "default"])
  .describe("supplied: the player's height was given to the Engine; default: the Engine's default prior");

export const posesInfoSchema = z.object({
  model: z.string().trim().min(1).describe("The model that lifted the broadcast's 2D poses to 3D"),
  players: z.record(id, z.object({
    heightMetres: z.number().positive().describe("Height the skeleton was scaled to"),
    heightSource,
  }).strict()),
}).strict().meta({ id: "PosesInfo" })
  .describe("Present when the match has rally files with player skeletons: a model's estimate from one broadcast camera, not checked by hand");

/** The match without its shot data: what the watch page needs. */
export const matchSchema = z.object({
  matchId: id,
  title: z.string().trim().min(1),
  players: z.tuple([playerSchema, playerSchema]),
  source: z.object({
    provider: z.literal("youtube"),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    durationSeconds: z.number().positive(),
    fps: z.number().positive().describe("Frame rate of the video the Engine processed; rally files have one skeleton per frame"),
  }).strict().describe("The published video every timestamp refers to. Playback embeds it; media is never re-hosted."),
  review: z.enum(["automatic", "reviewed"])
    .describe("automatic: produced by the engine and not checked by hand; reviewed: rally boundaries and scores checked by hand"),
  rallies: z.array(rallySchema).min(1),
  poses: posesInfoSchema.optional(),
}).strict();

const distribution = z.object({
  n: z.int().nonnegative(),
  median: z.number().optional(),
  p10: z.number().optional(),
  p90: z.number().optional(),
  max: z.number().optional(),
}).strict().meta({ id: "Distribution" });

const contact = z.enum(["racket", "net", "ground"]);

/** ShuttleSet's 12 merged stroke types, as the engine's shot-type model names them. */
export const SHOT_TYPES = [
  "net_shot", "return_net", "smash", "lift", "clear", "drive",
  "drop", "push", "rush", "cross_net", "short_serve", "long_serve",
] as const;
const shotTypeName = z.enum(SHOT_TYPES);
const probability = z.number().min(0).max(1);

export const shotTypeSchema = z.object({
  name: shotTypeName.nullable().describe("null: the model found no stroke type"),
  probability: probability.describe("Model probability of name (or of no type when name is null)"),
  runnerUp: shotTypeName,
  runnerUpProbability: probability,
  correction: z.object({
    from: shotTypeName.describe("The model's own pick"),
    fromProbability: probability,
    reason: z.enum(["high_deep_flight", "underarm_contact", "flat_flight"])
      .describe("high_deep_flight: a push that rose above 3 m and went over 5 m past the net (lift); underarm_contact: a clear hit below 1.8 m (lift); flat_flight: a clear that peaked below 2.5 m (drive)"),
  }).strict().optional().describe("Set when the shot's measured 3D flight contradicted the model and name was changed; probability is still the model's for name"),
}).strict().meta({ id: "ShotType" });

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
  shotType: shotTypeSchema.optional()
    .describe("Stroke type inferred by a model from the pose and shuttle tracks, not checked by hand; racket shots only"),
}).strict().meta({ id: "Shot" });

const shotTypeSummary = z.object({
  count: z.int().nonnegative(),
  okShots: z.int().nonnegative(),
  speed: distribution,
  apex: distribution,
  contactHeight: distribution,
  netClearance: distribution,
  endedRally: z.int().nonnegative().describe("Times this type was the rally's last shot"),
  endedRallyWon: z.int().nonnegative(),
  endedRallyKnownWinner: z.int().nonnegative(),
}).strict().meta({ id: "ShotTypeSummary" });

const replyTally = z.object({
  n: z.int().nonnegative(),
  replies: z.array(z.object({ type: shotTypeName, count: z.int().positive() }).strict()).describe("Most frequent first"),
}).strict().meta({ id: "ReplyTally" });

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
  shotTypes: z.object({
    typed: z.int().nonnegative(),
    unclear: z.int().nonnegative(),
    byType: z.partialRecord(shotTypeName, shotTypeSummary),
  }).strict().optional().describe("Per stroke type: counts over all typed shots, metric distributions over ok shots, rally endings"),
}).strict();

const rallySummarySchema = z.object({
  shots: z.int().nonnegative(),
  unreliable: z.int().nonnegative(),
  byPlayer: z.record(id, z.int().nonnegative()),
  fastest: z.int().nonnegative().nullable().describe("Index of the fastest shot that isn't unreliable"),
  highest: z.int().nonnegative().nullable(),
}).strict().meta({ id: "RallySummary" });

const gameSchema = z.object({
  game: z.int().min(1).max(3),
  final: z.record(id, z.int().nonnegative()).nullable().describe("Final score, when the last rally's score and winner are known"),
  winner: id.nullable(),
  rallies: z.int().positive(),
  longest: id.nullable().describe("Rally id with the most shots"),
  averageShots: z.number().nonnegative().nullable(),
}).strict().meta({ id: "GameSummary" });

/** A match's shot data, assembled from metadata.json. */
export const analysisSchema = z.object({
  matchId: id,
  quality: z.object({
    shots: z.int().nonnegative(),
    ok: z.int().nonnegative(),
    guessed: z.int().nonnegative(),
    unreliable: z.int().nonnegative(),
  }).strict(),
  rallies: z.record(id, z.object({ shots: z.array(shotSchema), summary: rallySummarySchema }).strict())
    .describe("Shots per rally and their records, keyed by rally id"),
  games: z.array(gameSchema).min(1).describe("One per game, in order"),
  players: z.record(id, playerAnalysisSchema).describe("Per-player summaries over ok shots, keyed by player id"),
  shotTypes: z.object({
    model: z.string().trim().min(1),
    training: z.string().trim().min(1),
    source: z.url(),
    order: z.array(shotTypeName).describe("Stroke types by total use in the match, most first"),
  }).strict().optional().describe("The model behind the shots' shotType; present whenever any shot has one"),
  patterns: z.object({
    responses: z.record(id, z.partialRecord(shotTypeName, replyTally))
      .describe("responses[player][type]: what the player played against the opponent's shot of that type"),
    followUps: z.record(id, z.partialRecord(shotTypeName, replyTally))
      .describe("followUps[player][type]: what the opponent played after the player's shot of that type"),
  }).strict().optional().describe("Direct exchanges between typed shots in this match"),
}).strict();

export const metadataSchema = z.object({
  version: z.literal(1),
  ...matchSchema.omit({ rallies: true, poses: true }).shape,
  rallies: z.array(rallySchema.extend({
    summary: rallySummarySchema.optional().describe("Present with shots"),
    shots: z.array(shotSchema).optional().describe("The rally's shots, in order; present when the match has analysis and the rally has shots"),
  }).strict()).min(1),
  analysis: analysisSchema.omit({ matchId: true, rallies: true }).optional()
    .describe("Match-level shot analysis; present when the match has shot data"),
  poses: posesInfoSchema.optional(),
}).strict().meta({ title: "Mintonix match metadata v1" });

const centimetres = z.int();

export const poseRunSchema = z.object({
  startFrame: z.int().nonnegative().describe("Source-video frame of the run's first sample; frame f is at f / fps seconds"),
  frames: z.int().min(2).describe("Consecutive frames in the run"),
  root: z.array(centimetres).describe("Hip position in court centimetres (x, y, z per frame, flat), as frame-to-frame differences; the first frame as is"),
  joints: z.array(centimetres).describe("The other 16 H36M joints relative to the hip (16 × x, y, z per frame, flat), as frame-to-frame differences"),
}).strict().meta({ id: "PoseRun" });

export const rallyMotionSchema = z.object({
  version: z.literal(1),
  matchId: id,
  rallyId: id,
  fps: z.number().positive(),
  poses: z.record(id, z.array(poseRunSchema))
    .describe("Each player's skeleton runs: watchable, tracked frames only; a new run starts after a gap and nothing joins runs. Engine estimate, not checked by hand"),
  distance: z.record(id, z.number().nonnegative())
    .describe("Metres each player covered horizontally along their runs (ankle midpoint smoothed over 0.3 s); gaps are not counted"),
}).strict().meta({ title: "Mintonix rally motion v1" });

export type Player = z.infer<typeof playerSchema>;
export type Rally = z.infer<typeof rallySchema>;
export type Match = z.infer<typeof matchSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ShotTypeName = (typeof SHOT_TYPES)[number];
export type MatchAnalysis = z.infer<typeof analysisSchema>;
export type ShotTypeSummary = z.infer<typeof shotTypeSummary>;
export type ReplyTally = z.infer<typeof replyTally>;
export type RallyRecords = z.infer<typeof rallySummarySchema>;
export type GameSummary = z.infer<typeof gameSchema>;
export type PosesInfo = z.infer<typeof posesInfoSchema>;
export type PoseRun = z.infer<typeof poseRunSchema>;
export type RallyMotion = z.infer<typeof rallyMotionSchema>;
export type Metadata = z.infer<typeof metadataSchema>;

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
  if (rallyIds.has("metadata")) fail("Invalid match: a rally id may not be metadata");
  for (const player of Object.keys(match.poses?.players ?? {})) {
    if (!playerIds.includes(player)) fail(`Invalid match: unknown player ${player} in poses`);
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
  for (const [rallyId, { shots, summary }] of Object.entries(analysis.rallies)) {
    for (const record of [summary.fastest, summary.highest]) {
      if (record !== null && record >= shots.length) fail(`Invalid analysis: rally records point past its shots (${rallyId})`);
    }
    const rally = rallies.get(rallyId) ?? fail(`Invalid analysis: unknown rally ${rallyId}`);
    const start = rally.segments[0][0];
    const end = rally.segments.at(-1)![1];
    let previous = start;
    for (const shot of shots) {
      if (shot.hitter !== null && !playerIds.includes(shot.hitter)) fail(`Invalid analysis: unknown hitter ${shot.hitter}`);
      if (shot.shotType) {
        if (shot.startContact !== "racket" || shot.hitter === null) fail(`Invalid analysis: only racket shots have a shot type (${rallyId})`);
        if (!analysis.shotTypes) fail("Invalid analysis: shot types need shotTypes to name their model");
      }
      if (shot.startSeconds < previous || shot.endSeconds <= shot.startSeconds || shot.endSeconds > end) {
        fail(`Invalid analysis: shots must be chronological and inside their rally (${rallyId})`);
      }
      previous = shot.startSeconds;
    }
  }
  for (const player of Object.keys(analysis.players)) {
    if (!playerIds.includes(player)) fail(`Invalid analysis: unknown player ${player}`);
  }
  for (const game of analysis.games) {
    if (game.longest !== null && !rallies.has(game.longest)) fail(`Invalid analysis: unknown longest rally ${game.longest}`);
    if (game.winner !== null && !playerIds.includes(game.winner)) fail(`Invalid analysis: unknown game winner ${game.winner}`);
  }
  for (const side of Object.values(analysis.patterns ?? {})) {
    for (const player of Object.keys(side)) if (!playerIds.includes(player)) fail(`Invalid analysis: unknown player ${player} in patterns`);
  }
  return analysis;
}

/** Validate a metadata.json file and split it into the match and its shot data. */
export function parseMetadata(input: unknown): { match: Match; analysis: MatchAnalysis | null } {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) fail(`Invalid metadata: ${firstIssue(parsed.error)}`);
  const { rallies: rows, analysis: shotData, ...file } = parsed.data;
  const rest = Object.fromEntries(Object.entries(file).filter(([key]) => key !== "version"));
  const rallies: Rally[] = [];
  const shotsByRally: MatchAnalysis["rallies"] = {};
  for (const { summary, shots, ...rally } of rows) {
    rallies.push(rally);
    if ((summary === undefined) !== (shots === undefined)) fail(`Invalid metadata: a rally's shots and summary come together (${rally.id})`);
    if (shots && summary) {
      if (!shotData) fail(`Invalid metadata: rally shots need the match analysis (${rally.id})`);
      shotsByRally[rally.id] = { shots, summary };
    }
  }
  const match = parseMatch({ ...rest, rallies });
  const analysis = shotData ? parseAnalysis({ matchId: match.matchId, ...shotData, rallies: shotsByRally }, match) : null;
  return { match, analysis };
}

/** Validate a rally file against its match. */
export function parseRallyMotion(input: unknown, match: Match): RallyMotion {
  const parsed = rallyMotionSchema.safeParse(input);
  if (!parsed.success) fail(`Invalid rally motion: ${firstIssue(parsed.error)}`);
  const motion = parsed.data;
  if (motion.matchId !== match.matchId) fail("Invalid rally motion: match id differs from its match");
  const rally = match.rallies.find((candidate) => candidate.id === motion.rallyId) ?? fail(`Invalid rally motion: unknown rally ${motion.rallyId}`);
  if (motion.fps !== match.source.fps) fail("Invalid rally motion: fps differs from the match source");
  const playerIds = match.players.map((player) => player.id);
  for (const player of [...Object.keys(motion.poses), ...Object.keys(motion.distance)]) {
    if (!playerIds.includes(player)) fail(`Invalid rally motion: unknown player ${player}`);
  }
  // A frame's time is its start; half a frame of slack absorbs rounding of the segment bounds.
  const slack = 0.5 / motion.fps;
  const inSegments = (time: number) => rally.segments.some(([start, end]) => time >= start - slack && time < end + slack);
  for (const [player, runs] of Object.entries(motion.poses)) {
    let previousEnd = -1;
    for (const run of runs) {
      if (run.root.length !== run.frames * 3 || run.joints.length !== run.frames * 48) {
        fail(`Invalid rally motion: run sizes don't match their frames (${player})`);
      }
      const last = run.startFrame + run.frames - 1;
      if (run.startFrame <= previousEnd) fail(`Invalid rally motion: runs must be chronological and not overlap (${player})`);
      if (!inSegments(run.startFrame / motion.fps) || !inSegments(last / motion.fps)) {
        fail(`Invalid rally motion: runs must lie inside the rally's segments (${player})`);
      }
      previousEnd = last;
    }
  }
  return motion;
}
