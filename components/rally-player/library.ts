import type { Match } from "./contract.ts";

/** "VICTOR China Open 2025, men’s singles final" → event "VICTOR China Open 2025", round "Men’s singles final". */
export function splitMatchTitle(title: string) {
  const comma = title.lastIndexOf(", ");
  if (comma === -1) return { event: title, round: null };
  const round = title.slice(comma + 2);
  return { event: title.slice(0, comma), round: round.charAt(0).toUpperCase() + round.slice(1) };
}

const roundOrder = ["final", "semifinal", "quarterfinal"];

function roundRank(round: string | null) {
  const words = round?.toLowerCase().split(/\s+/) ?? [];
  const rank = roundOrder.findIndex((name) => words.includes(name));
  return rank === -1 ? roundOrder.length : rank;
}

/** Matches grouped by event, in the given order of first appearance; each event's final first, then later rounds back. */
export function groupMatchesByEvent<T extends { match: Pick<Match, "matchId" | "title"> }>(items: T[]) {
  const groups = new Map<string, { event: string; items: (T & { round: string | null })[] }>();
  for (const item of items) {
    const { event, round } = splitMatchTitle(item.match.title);
    const group = groups.get(event) ?? { event, items: [] };
    group.items.push({ ...item, round });
    groups.set(event, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => roundRank(a.round) - roundRank(b.round) || a.match.matchId.localeCompare(b.match.matchId)),
  }));
}
