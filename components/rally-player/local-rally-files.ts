import "server-only";

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseRallyMotion, type Match, type RallyMotion } from "./contract.ts";
import { idPattern, matchesDirectory, readJson } from "./local-match.ts";

/**
 * Rally files (`<matchId>/<rallyId>.json`: player skeletons and running distance), read only
 * by their route, which prerenders every one at build. Kept apart from `local-match.ts` so no
 * other server function traces ~100 MB of skeletons.
 */

/** One rally's player motion, or null when the rally has no rally file. */
export async function readLocalRallyMotion(match: Match, rallyId: string): Promise<RallyMotion | null> {
  if (!idPattern.test(rallyId) || !match.rallies.some((rally) => rally.id === rallyId)) return null;
  const input = await readJson(join(/*turbopackIgnore: true*/ matchesDirectory(), match.matchId, `${rallyId}.json`));
  return input === null ? null : parseRallyMotion(input, match);
}

/** The rallies of a match that have a rally file, without reading them. */
export async function listLocalRallyMotion(match: Match): Promise<string[]> {
  try {
    const names = new Set(await readdir(join(/*turbopackIgnore: true*/ matchesDirectory(), match.matchId)));
    return match.rallies.map((rally) => rally.id).filter((id) => names.has(`${id}.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
