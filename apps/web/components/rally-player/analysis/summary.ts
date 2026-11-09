import type { Match, MatchAnalysis, Shot } from "../contract.ts";

type Distribution = MatchAnalysis["players"][string]["speed"];

function best(shots: readonly Shot[], pick: (shot: Shot) => number | null) {
  let index = -1;
  shots.forEach((shot, i) => {
    const value = shot.quality === "unreliable" ? null : pick(shot);
    if (value !== null && (index < 0 || value > pick(shots[index])!)) index = i;
  });
  return index;
}

/** One rally's shots in a few facts. Fastest and highest skip unreliable shots; -1 when none qualify. */
export function rallySummary(shots: readonly Shot[]) {
  const byPlayer: Record<string, number> = {};
  for (const shot of shots) if (shot.hitter) byPlayer[shot.hitter] = (byPlayer[shot.hitter] ?? 0) + 1;
  return {
    shots: shots.length,
    unreliable: shots.filter((shot) => shot.quality === "unreliable").length,
    byPlayer,
    fastest: best(shots, (shot) => shot.speed),
    highest: best(shots, (shot) => shot.apex),
    last: shots.at(-1),
  };
}

/** Per game: its rallies, final score (when the scores allow it), winner and longest rally by shots. */
export function gameSummaries(match: Match, analysis?: MatchAnalysis) {
  const ids = match.players.map((player) => player.id);
  const groups: { game: number; indices: number[] }[] = [];
  match.rallies.forEach((rally, index) => {
    const last = groups.at(-1);
    if (last?.game === rally.game) last.indices.push(index);
    else groups.push({ game: rally.game, indices: [index] });
  });
  return groups.map(({ game, indices }) => {
    const counts = indices.map((index) => analysis?.rallies[match.rallies[index].id]?.shots.length ?? 0);
    const lastRally = match.rallies[indices.at(-1)!];
    let final: Record<string, number> | null = null;
    if (lastRally.scoreBefore && lastRally.winner) {
      final = { ...lastRally.scoreBefore, [lastRally.winner]: lastRally.scoreBefore[lastRally.winner] + 1 };
    }
    const top = final ? Math.max(...ids.map((id) => final![id])) : 0;
    const leaders = final ? ids.filter((id) => final![id] === top) : [];
    const longest = counts.length ? indices[counts.indexOf(Math.max(...counts))] : -1;
    return {
      game,
      indices,
      final,
      winner: top >= 21 && leaders.length === 1 ? leaders[0] : null,
      longest: analysis && Math.max(...counts) > 0 ? longest : -1,
      averageShots: analysis ? counts.reduce((sum, count) => sum + count, 0) / counts.length : null,
    };
  });
}

/** Where one value sits against a player's middle 80%. */
export function bandPosition(value: number | null, stats: Distribution) {
  if (value === null || stats.p10 === undefined || stats.p90 === undefined || !stats.n) return null;
  return value > stats.p90 ? "above" : value < stats.p10 ? "below" : "within";
}
