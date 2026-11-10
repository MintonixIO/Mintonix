import type { Match, MatchAnalysis, Rally, Shot } from "../contract.ts";
import { shotTypeView } from "../analysis/shot-types.ts";
import { rallySeconds, rallyStart } from "../timeline.ts";
import type { SearchIntent, SearchTarget } from "./intent.ts";

type Stroke = { shot: Shot; index: number };
export type SearchCandidate = {
  kind: "rally" | "shot"; rally: Rally; rallyIndex: number; stroke?: Stroke;
  strokes: Stroke[]; seconds: number; pace: number; attack: number; clutch: number;
};
export type SearchIndex = { match: Match; candidates: SearchCandidate[]; hasAnalysis: boolean };
export type SearchResult = {
  id: string; kind: "rally" | "shot"; rallyId: string; rallyIndex: number; shotIndex: number | null;
  title: string; player: string | null; game: number; score: string | null; startSeconds: number;
  seconds: number; shotCount: number | null; matchPercent: number; fits: boolean;
  reasons: string[]; missing: string[]; sequence: string[];
  speedKmh: number | null; typeConfidence: number | null; typeUncertain: boolean;
  typeCorrected: boolean; quality: string | null; paths: [number, number][][];
};
export type RankedSearch = {
  results: SearchResult[]; message: string; interpretation: string[]; notices: string[]; exactCount: number;
};
export type SearchResponse = RankedSearch & { mode: "language" | "local" };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const okSpeed = (shot: Shot) => shot.quality === "ok" && shot.speed !== null ? shot.speed * 3.6 : null;

/** Build only from published JSON. No database, embeddings, or generated descriptions. */
export function buildSearchIndex(match: Match, analysis: MatchAnalysis | null): SearchIndex {
  const candidates: SearchCandidate[] = [];
  match.rallies.forEach((rally, rallyIndex) => {
    const strokes = (analysis?.rallies[rally.id]?.shots ?? []).flatMap((shot, index) =>
      shot.startContact === "racket" ? [{ shot, index }] : []);
    const seconds = rallySeconds(rally);
    const scores = Object.values(rally.scoreBefore ?? {});
    const base = {
      rally, rallyIndex, strokes, seconds, pace: strokes.length / Math.max(1, seconds),
      attack: strokes.filter(({ shot }) => ["smash", "drive", "rush"].includes(shot.shotType?.name ?? "") && shotTypeView(shot)?.confident).length,
      clutch: scores.length === 2 ? clamp((Math.max(...scores) - 14) / 6) * clamp(1 - Math.abs(scores[0] - scores[1]) / 6) : 0,
    };
    candidates.push({ ...base, kind: "rally" });
    strokes.forEach((stroke) => candidates.push({ ...base, kind: "shot", stroke }));
  });
  return { match, candidates, hasAnalysis: analysis !== null };
}

function feature(candidate: SearchCandidate, vibe: SearchIntent["vibes"][number]) {
  const { strokes, seconds, pace, attack, clutch } = candidate;
  const selected = candidate.stroke ? [candidate.stroke] : strokes;
  const speeds = selected.flatMap(({ shot }) => okSpeed(shot) === null ? [] : [okSpeed(shot)!]);
  const speed = Math.max(0, ...speeds);
  // Smooth, monotonic scales: the fastest/longest candidates must not tie just
  // because they exceed a fixed ceiling. The units remain inspectable in cards.
  const fast = speed / (speed + 90);
  const endurance = seconds / (seconds + 15);
  const pressure = clamp(pace / 1.4);
  const attacking = clamp(attack / 6);
  switch (vibe) {
    case "long": return endurance;
    case "short": return 1 - clamp(seconds / 25);
    case "fast": return fast;
    case "high": return clamp(Math.max(0, ...selected.map(({ shot }) => shot.quality === "ok" ? shot.apex ?? 0 : 0)) / 8);
    case "tight_net": {
      const heights = selected.flatMap(({ shot }) => shot.quality === "ok" && shot.netClearance !== null && shot.netClearance >= 0 ? [shot.netClearance] : []);
      return heights.length ? 1 - clamp(Math.min(...heights) / 0.8) : 0;
    }
    case "clutch": return clutch;
    case "intense": return 0.4 * endurance + 0.3 * pressure + 0.2 * attacking + 0.1 * clutch;
    case "exciting": return 0.3 * endurance + 0.25 * fast + 0.25 * attacking + 0.2 * clutch;
  }
}

const vibeDescriptions: Record<SearchIntent["vibes"][number], string> = {
  exciting: "Exciting: longer exchanges, fast shots, attacks and close late-game scores",
  intense: "Intense: rally length, exchange pace, attacks and score pressure",
  long: "Longer playing time", short: "Shorter playing time", fast: "Higher measured launch speed",
  high: "Higher measured flight", tight_net: "Lower measured clearance above the net", clutch: "Close scores late in a game",
};

function sequenceFits(strokes: Stroke[], sequence: SearchIntent["sequence"], anchor?: number) {
  return strokes.some((_, start) => (anchor === undefined || (anchor >= start && anchor < start + sequence.length)) &&
    sequence.every((type, offset) => {
      const view = strokes[start + offset] && shotTypeView(strokes[start + offset].shot);
      return view?.confident && view.name === type;
    }));
}

/** The model is asked for player IDs but may answer with a name; unknown people stay as written. */
function resolvePlayer(match: Match, value: string | null) {
  if (value === null) return null;
  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = match.players.filter((p) => p.id === value || (words.length > 0 && words.every((word) => p.name.toLowerCase().split(/\s+/).includes(word))));
  return hits.length === 1 ? hits[0].id : value;
}

export function rankSearch(index: SearchIndex, input: SearchIntent, target: SearchTarget = "all", verified = true): RankedSearch {
  const intent = { ...input, player: resolvePlayer(index.match, input.player), winner: resolvePlayer(index.match, input.winner) };
  const requested = target === "all" ? intent.target : target;
  const pool = index.candidates.filter((c) => requested === "all" || (requested === "shots" ? c.kind === "shot" : c.kind === "rally"));
  const name = (id: string) => index.match.players.find((p) => p.id === id)?.name ?? id;
  const hasShotConditions = intent.types.length > 0 || intent.player !== null || intent.minSpeed !== null || intent.maxSpeed !== null || intent.winningShot;
  const ranked = pool.map((candidate) => {
    const { rally, strokes, stroke } = candidate;
    const checks: { value: number; label: string }[] = [];
    const add = (value: boolean | number, label: string) => checks.push({ value: Number(value), label });
    if (intent.game !== null) add(rally.game === intent.game, `Game ${intent.game}`);
    if (intent.winner !== null) add(rally.winner === intent.winner, `Rally won by ${name(intent.winner)}`);
    if (intent.minSeconds !== null) add(candidate.seconds >= intent.minSeconds, `At least ${intent.minSeconds}s of play`);
    if (intent.maxSeconds !== null) add(candidate.seconds <= intent.maxSeconds, `At most ${intent.maxSeconds}s of play`);
    const knownShots = index.hasAnalysis && strokes.length > 0;
    if (intent.minShots !== null) add(knownShots && strokes.length >= intent.minShots, `At least ${intent.minShots} strokes`);
    if (intent.maxShots !== null) add(knownShots && strokes.length <= intent.maxShots, `At most ${intent.maxShots} strokes`);
    if (intent.excludeTypes.length) {
      const relevant = stroke ? [stroke] : strokes;
      add(relevant.length > 0 && relevant.every(({ shot }) => {
        const type = shotTypeView(shot);
        return type?.confident && type.name && !intent.excludeTypes.includes(type.name);
      }), `No ${intent.excludeTypes.join(" / ").replaceAll("_", " ")}`);
    }
    if (intent.sequence.length && !hasShotConditions) add(sequenceFits(strokes, intent.sequence, stroke ? strokes.indexOf(stroke) : undefined),
      `Sequence: ${intent.sequence.join(" → ").replaceAll("_", " ")}`);
    // All hitter/type/speed conditions must be satisfied by the SAME stroke.
    let evidence: Stroke | undefined = stroke;
    if (hasShotConditions) {
      const options = (stroke ? [stroke] : strokes).map((item) => {
        const shot = item.shot;
        const type = shotTypeView(shot);
        const speed = okSpeed(shot);
        const constraints: { value: number; label: string }[] = [];
        if (intent.types.length) constraints.push({ value: type?.name && intent.types.includes(type.name) ? type.confident ? 1 : 0.5 : 0, label: `${intent.types.join(" / ").replaceAll("_", " ")} (inferred)` });
        if (intent.player !== null) constraints.push({ value: Number(shot.hitter === intent.player), label: `Hit by ${name(intent.player)}` });
        if (intent.minSpeed !== null) constraints.push({ value: Number(speed !== null && speed >= intent.minSpeed), label: `Launch speed ≥ ${intent.minSpeed} km/h` });
        if (intent.maxSpeed !== null) constraints.push({ value: Number(speed !== null && speed <= intent.maxSpeed), label: `Launch speed ≤ ${intent.maxSpeed} km/h` });
        if (intent.winningShot) constraints.push({ value: Number(strokes.at(-1) === item && Boolean(rally.winner) && shot.hitter === rally.winner), label: "Final stroke by the rally winner" });
        if (intent.sequence.length) constraints.push({ value: Number(sequenceFits(strokes, intent.sequence, strokes.indexOf(item))), label: `Sequence: ${intent.sequence.join(" → ").replaceAll("_", " ")}` });
        const preference = intent.vibes.reduce((n, vibe) => n + feature({ ...candidate, stroke: item }, vibe), 0);
        return { item, constraints, score: constraints.reduce((n, c) => n + c.value, 0), preference };
      }).sort((a, b) => b.score - a.score || b.preference - a.preference);
      if (options[0]) {
        checks.push(...options[0].constraints);
        evidence = options[0].item;
      } else add(false, "Matching shot data is unavailable");
    }
    intent.unsupported.forEach((condition) => add(false, `Cannot verify: ${condition}`));
    const hard = checks.length ? checks.reduce((n, c) => n + c.value, 0) / checks.length : 1;
    const scoped = evidence ? { ...candidate, stroke: evidence } : candidate;
    const soft = intent.vibes.length ? intent.vibes.reduce((n, vibe) => n + feature(scoped, vibe), 0) / intent.vibes.length : feature(candidate, "exciting");
    const fits = verified && checks.every((c) => c.value === 1) && (checks.length > 0 || intent.vibes.length > 0) && (!intent.vibes.length || soft >= 0.55);
    let percent = checks.length ? 100 * hard * (intent.vibes.length ? 0.65 + 0.35 * soft : 1) : 100 * soft;
    if (intent.vibes.length) percent = Math.min(99, percent);
    if (!fits) percent = Math.min(79, percent);
    if (!verified) percent = Math.min(74, percent);
    return { candidate, evidence, fits, percent: Math.round(percent), soft, checks };
  }).sort((a, b) => Number(b.fits) - Number(a.fits) || b.percent - a.percent || b.soft - a.soft || a.candidate.rallyIndex - b.candidate.rallyIndex);

  const fits = ranked.filter((r) => r.fits);
  const counts = new Map<string, number>();
  // Keep suggestions varied, rather than returning eight strokes from one rally.
  const selected = (fits.length ? fits : ranked).filter(({ candidate }) => {
    const n = counts.get(candidate.rally.id) ?? 0;
    if (n >= (requested === "shots" ? 2 : 1)) return false;
    counts.set(candidate.rally.id, n + 1);
    return true;
  }).slice(0, 8);
  const results: SearchResult[] = selected.map(({ candidate, evidence, fits, percent, checks }) => {
    const { rally, rallyIndex, stroke, strokes } = candidate;
    const shot = stroke?.shot;
    const type = shot && shotTypeView(shot);
    const preview = stroke ? [stroke] : evidence ? [evidence] : strokes.slice(0, 6);
    const paths = preview.filter(({ shot }) => shot.quality !== "unreliable" && shot.path.length > 1).map(({ shot }) => {
      const step = Math.max(1, Math.ceil(shot.path.length / 16));
      return shot.path.filter((_, i) => i % step === 0 || i === shot.path.length - 1).map(([, x, y]) => [x, y] as [number, number]);
    });
    return {
      id: `${rally.id}${stroke ? `.${stroke.index}` : ""}`, kind: candidate.kind,
      rallyId: rally.id, rallyIndex, shotIndex: stroke?.index ?? null,
      title: shot ? `${type?.label ?? "Untyped shot"}${type && !type.confident ? " (uncertain)" : ""}` : `Rally ${rallyIndex + 1}`,
      player: shot?.hitter ? name(shot.hitter) : null, game: rally.game,
      score: rally.scoreBefore ? index.match.players.map((p) => rally.scoreBefore![p.id]).join("–") : null,
      startSeconds: shot?.startSeconds ?? rallyStart(rally), seconds: candidate.seconds,
      shotCount: strokes.length || null, matchPercent: percent, fits,
      reasons: checks.filter((c) => c.value === 1).map((c) => c.label).slice(0, 4),
      missing: checks.filter((c) => c.value !== 1).map((c) => c.label),
      sequence: strokes.slice(0, 8).map(({ shot }) => { const t = shotTypeView(shot); return `${t?.short ?? "?"}${t && !t.confident ? "?" : ""}`; }),
      speedKmh: shot ? okSpeed(shot) : null, typeConfidence: type?.probability ?? null,
      typeUncertain: type ? !type.confident : false, typeCorrected: type?.corrected ?? false, quality: shot?.quality ?? null, paths,
    };
  });
  const notices = ["Match % is a relevance score, not a probability. Shot types are model inferences, not checked by hand."];
  if (!verified) notices.push("Language search is unavailable. These are approximate keyword suggestions; some requirements may be missed.");
  if (!index.hasAnalysis) notices.push("This match has no shot analysis. Only rally timing and scores can be searched.");
  if (intent.unsupported.length) notices.push(`Cannot verify: ${intent.unsupported.join("; ")}.`);
  const interpretation = intent.vibes.map((v) => vibeDescriptions[v]);
  let message = fits.length
    ? intent.vibes.length ? "Closest matches to your description. Subjective qualities are estimated from the available data." : "These results fit your searchable criteria. Inferred shot types can still be wrong."
    : verified ? "No exact rally or shot found for all your requirements. You might like these nearby results." : "No exact match could be confirmed. Here are approximate suggestions from the available match data.";
  if (!results.length) message = "No shots are available to search in this match. Try searching rallies instead.";
  return { results, message, interpretation, notices, exactCount: verified && !intent.vibes.length ? fits.length : 0 };
}
