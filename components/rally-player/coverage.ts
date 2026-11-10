import type { Match, Rally } from "./contract.ts";
import { formatTime, rallySeconds } from "./timeline.ts";

/** Watchable seconds across every rally: the one total every page reports. */
export function playSeconds(rallies: readonly Rally[]) {
  return rallies.reduce((total, rally) => total + rallySeconds(rally), 0);
}

/** The play total as shown to people, rounded once so every page agrees. */
export function formatPlayTime(rallies: readonly Rally[]) {
  return formatTime(Math.round(playSeconds(rallies)));
}

const points = (rally: Rally) => rally.scoreBefore ? Object.values(rally.scoreBefore).reduce((sum, score) => sum + score, 0) : null;

/**
 * For each rally, how many points the score says were played just before it
 * that the match doesn't contain (0 when none, or when a score is unknown).
 * A game's first rally is compared with 0–0.
 */
export function missingPointsBefore(rallies: readonly Rally[]): number[] {
  return rallies.map((rally, index) => {
    const now = points(rally);
    if (now === null) return 0;
    const previous = rallies[index - 1];
    if (!previous || previous.game !== rally.game) return now;
    const before = points(previous);
    return before === null ? 0 : Math.max(0, now - before - 1);
  });
}

/** Rallies in the match against the points its scores show were played. */
export function pointCoverage(rallies: readonly Rally[]) {
  const missing = missingPointsBefore(rallies).reduce((sum, count) => sum + count, 0);
  return { rallies: rallies.length, missing, played: rallies.length + missing };
}

export type GameResult = { game: number; score: Record<string, number>; winner: string };

/**
 * Final score of each game whose last rally completes it (21 with a two-point
 * lead, or 30). Games that end mid-score are left out instead of guessed.
 */
export function gameResults(match: Match): GameResult[] {
  const last = new Map<number, Rally>();
  for (const rally of match.rallies) last.set(rally.game, rally);
  const results: GameResult[] = [];
  for (const [game, rally] of last) {
    if (!rally.scoreBefore || !rally.winner) continue;
    const score = { ...rally.scoreBefore, [rally.winner]: rally.scoreBefore[rally.winner] + 1 };
    const won = score[rally.winner];
    const lost = Math.max(...Object.entries(score).filter(([id]) => id !== rally.winner).map(([, value]) => value));
    if (won === 30 || (won >= 21 && won - lost >= 2)) results.push({ game, score, winner: rally.winner });
  }
  return results;
}

/** Games won by each player, and the match winner once two completed games are theirs. */
export function matchResult(match: Match) {
  const games = gameResults(match);
  const gamesWon = Object.fromEntries(match.players.map((player) => [player.id, games.filter((game) => game.winner === player.id).length]));
  const winner = match.players.find((player) => gamesWon[player.id] === 2)?.id ?? null;
  return { games, gamesWon, winner };
}

/** Why points can be absent, without claiming more than the match's review status supports. */
export function missingPointsReason(review: Match["review"]) {
  return review === "reviewed" ? "weren’t shown on the main camera" : "weren’t detected or weren’t shown on the main camera";
}

/** Row label for points missing before a rally, e.g. "1 point off the main camera". */
export function missingPointsLabel(count: number, review: Match["review"]) {
  return `${count} ${count === 1 ? "point" : "points"} ${review === "reviewed" ? "off camera" : "not captured"}`;
}
