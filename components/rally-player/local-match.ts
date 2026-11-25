import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseMetadata, type Match, type MatchAnalysis } from "./contract.ts";

/**
 * Match folders: `<directory>/<matchId>/metadata.json` (the match and its shot data)
 * and, when the Engine reconstructed the players, `<rallyId>.json` per rally (their
 * skeletons and running distance). The directory is the published set in
 * `content/matches` (committed, deployed with the app) unless
 * `MINTONIX_LOCAL_MATCHES_DIR` points somewhere else. Nothing here reaches the client
 * bundle; no media is read or served.
 */
export const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function matchesDirectory() {
  const directory = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  // Not traced from here (that would ship every rally file with every function): next.config.ts
  // includes only the metadata files.
  if (!directory) return join(/*turbopackIgnore: true*/ process.cwd(), "content/matches");
  if (!isAbsolute(directory)) throw new Error("MINTONIX_LOCAL_MATCHES_DIR must be an absolute path");
  return directory;
}

export async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readLocalMetadata(matchId: string): Promise<{ match: Match; analysis: MatchAnalysis | null } | null> {
  if (!idPattern.test(matchId)) return null;
  const input = await readJson(join(matchesDirectory(), matchId, "metadata.json"));
  if (input === null) return null;
  const metadata = parseMetadata(input);
  if (metadata.match.matchId !== matchId) throw new Error("Local match ID does not match its directory");
  return metadata;
}

/** Only publish matches with a valid metadata file. Video plays from its YouTube source. */
export async function listLocalMatches(): Promise<Match[]> {
  const directory = matchesDirectory();
  let entries;
  try {
    entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results = await Promise.allSettled(entries
    .filter((entry) => entry.isDirectory() && idPattern.test(entry.name))
    .map((entry) => readLocalMatch(entry.name)));
  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort((a, b) => a.matchId.localeCompare(b.matchId));
}

export async function readLocalMatch(matchId: string): Promise<Match | null> {
  return (await readLocalMetadata(matchId))?.match ?? null;
}

/** Shot data for a match, or null when the match has none. */
export async function readLocalAnalysis(match: Match): Promise<MatchAnalysis | null> {
  return (await readLocalMetadata(match.matchId))?.analysis ?? null;
}

/** Whether a match has shot data. */
export async function hasLocalAnalysis(match: Match) {
  return (await readLocalAnalysis(match)) !== null;
}
