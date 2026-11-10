import type { Match, MatchAnalysis } from "../contract.ts";

type Distribution = MatchAnalysis["players"][string]["speed"];

/** The match's rallies grouped by game, by position in match.rallies (needs no analysis). */
export function groupByGame(match: Match) {
  const groups: { game: number; indices: number[] }[] = [];
  match.rallies.forEach((rally, index) => {
    const last = groups.at(-1);
    if (last?.game === rally.game) last.indices.push(index);
    else groups.push({ game: rally.game, indices: [index] });
  });
  return groups;
}

/** Where one value sits against a player's middle 80%. */
export function bandPosition(value: number | null, stats: Distribution) {
  if (value === null || stats.p10 === undefined || stats.p90 === undefined || !stats.n) return null;
  return value > stats.p90 ? "above" : value < stats.p10 ? "below" : "within";
}
