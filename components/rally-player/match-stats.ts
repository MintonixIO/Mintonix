import type { Match, MatchAnalysis } from "./contract.ts";

/** A rally counts as long from this many shots. */
export const LONG_RALLY_SHOTS = 15;

export type FlowPoint = { index: number | null; lead: number };
export type GameFlow = { game: number; points: FlowPoint[]; final: string | null };

/**
 * Each game's lead (first player minus second) before every rally with a score, closed by the
 * final score when it is known. Missed points show as jumps between rallies; nothing is invented.
 */
export function scoreFlow(match: Match, analysis?: MatchAnalysis): GameFlow[] {
  const [first, second] = match.players.map((player) => player.id);
  const games: GameFlow[] = [];
  const lastScore = new Map<number, { score: Record<string, number>; winner?: string }>();
  match.rallies.forEach((rally, index) => {
    let game = games.at(-1);
    if (!game || game.game !== rally.game) {
      game = { game: rally.game, points: [], final: null };
      games.push(game);
    }
    if (!rally.scoreBefore) {
      lastScore.delete(rally.game);
      return;
    }
    game.points.push({ index, lead: rally.scoreBefore[first] - rally.scoreBefore[second] });
    lastScore.set(rally.game, { score: rally.scoreBefore, winner: rally.winner });
  });
  for (const game of games) {
    let final = analysis?.games.find((summary) => summary.game === game.game)?.final ?? null;
    const last = lastScore.get(game.game);
    if (!final && last?.winner && game.points.length) {
      final = { ...last.score, [last.winner]: last.score[last.winner] + 1 };
    }
    if (final) {
      game.points.push({ index: null, lead: final[first] - final[second] });
      game.final = `${final[first]}–${final[second]}`;
    }
  }
  return games;
}

export type HeadToHeadRow = {
  label: string;
  /** "est": measured from the broadcast; "model": a model's inference. Neither is checked by hand. */
  tag?: "est" | "model";
  values: [number, number];
  detail?: [string, string];
  unit?: string;
};

/** Side-by-side counts for the two players; a row is left out when the match has nothing for it. */
export function headToHead(match: Match, analysis?: MatchAnalysis): HeadToHeadRow[] {
  const ids = match.players.map((player) => player.id) as [string, string];
  const pair = (value: (id: string) => number) => ids.map(value) as [number, number];
  const rows: HeadToHeadRow[] = [];

  const decided = match.rallies.filter((rally) => rally.winner);
  if (decided.length) rows.push({ label: "Rallies won", values: pair((id) => decided.filter((rally) => rally.winner === id).length) });

  const served = match.rallies.filter((rally) => rally.server && rally.winner);
  if (served.length) {
    const serves = pair((id) => served.filter((rally) => rally.server === id).length);
    const won = pair((id) => served.filter((rally) => rally.server === id && rally.winner === id).length);
    rows.push({ label: "Won on own serve", values: won, detail: [0, 1].map((i) => `${won[i]}/${serves[i]}`) as [string, string] });
  }

  if (!analysis) return rows;

  const long = match.rallies.filter((rally) => rally.winner && (analysis.rallies[rally.id]?.summary.shots ?? 0) >= LONG_RALLY_SHOTS);
  rows.push({ label: "Long rallies won", values: pair((id) => long.filter((rally) => rally.winner === id).length) });

  const fastest = pair((id) => {
    const max = analysis.players[id]?.speed.max;
    return max === undefined ? 0 : Math.round(max * 3.6);
  });
  if (fastest.some((value) => value > 0)) rows.push({ label: "Fastest shot", tag: "est", values: fastest, unit: "km/h" });

  if (analysis.shotTypes) {
    rows.push({ label: "Smashes", tag: "model", values: pair((id) => analysis.players[id]?.shotTypes?.byType.smash?.count ?? 0) });
  }
  return rows;
}
