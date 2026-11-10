import type { Match, Player } from "../contract";
import type { PlayerTone } from "./court-drawing";

export function playerTools(match: Match) {
  const [first, second] = match.players;
  const byId = new Map<string, Player>(match.players.map((player) => [player.id, player]));
  return {
    name: (id: string | null | undefined) => (id && byId.get(id)?.name) || "Net cord",
    shortName: (id: string | null | undefined) => (id && byId.get(id)?.name.split(" ").at(-1)) || "Net",
    tone: (id: string | null | undefined): PlayerTone => id === first.id ? "a" : id === second.id ? "b" : "none",
  };
}

export function value(number: number | null | undefined, digits = 0, scale = 1) {
  return number === null || number === undefined ? "–" : (number * scale).toFixed(digits);
}

export const METRICS = [
  { field: "speed", label: "Launch speed", unit: "km/h", scale: 3.6, digits: 0 },
  { field: "apex", label: "Highest point", unit: "m", scale: 1, digits: 1 },
  { field: "netClearance", label: "Over the net", unit: "cm", scale: 100, digits: 0 },
  { field: "contactHeight", label: "Contact height", unit: "m", scale: 1, digits: 1 },
] as const;
