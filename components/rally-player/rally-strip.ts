import type { Match, Rally } from "./contract.ts";
import { playerTools } from "./analysis/players.ts";
import { rallyEnd, rallySeconds, rallyStart } from "./timeline.ts";

/** One mark in the control bar's strip: a rally, or a break for points that weren't captured. */
export type StripItem = { kind: "rally"; index: number; weight: number } | { kind: "missing"; count: number };
export type StripGame = { game: number; items: StripItem[]; weight: number };

/** Rallies grouped by game, each weighted by its length (with a floor, so short rallies stay clickable). */
export function rallyStrip(rallies: readonly Rally[], missingBefore: readonly number[], minSeconds = 4): StripGame[] {
  const games: StripGame[] = [];
  rallies.forEach((rally, index) => {
    let group = games.at(-1);
    if (!group || group.game !== rally.game) {
      group = { game: rally.game, items: [], weight: 0 };
      games.push(group);
    }
    if (missingBefore[index] > 0) group.items.push({ kind: "missing", count: missingBefore[index] });
    const weight = Math.max(rallySeconds(rally), minSeconds);
    group.items.push({ kind: "rally", index, weight });
    group.weight += weight;
  });
  return games;
}

/** How far the playhead is through a rally's span, from 0 to 1. */
export function rallyProgress(rally: Rally, time: number): number {
  const start = rallyStart(rally);
  const span = rallyEnd(rally) - start;
  if (!(span > 0)) return time >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (time - start) / span));
}

/** The score before a rally, in the match's player order ("6–3"). */
export function rallyScore(match: Match, index: number): string {
  const score = match.rallies[index]?.scoreBefore;
  if (!score) return "No score";
  return match.players.map((player) => score[player.id]).join("–");
}

/** What a strip mark says about its rally: "G1 · 6–3 · 19 s · point to Qi". */
export function rallyTip(match: Match, index: number): string {
  const rally = match.rallies[index];
  const parts = [`G${rally.game}`, rallyScore(match, index), `${Math.round(rallySeconds(rally))} s`];
  if (rally.winner) parts.push(`point to ${playerTools(match).shortName(rally.winner)}`);
  return parts.join(" · ");
}
