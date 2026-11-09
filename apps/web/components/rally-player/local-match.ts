import "server-only";

import { access, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseAnalysis, parseMatch, type Match, type MatchAnalysis } from "./contract.ts";

/**
 * Local match bundles: `$MINTONIX_LOCAL_MATCHES_DIR/<matchId>/match.json`
 * (required) and `analysis.json` (optional shot data). Both stay outside Git
 * and the client bundle; no media is read or served.
 */
const matchIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function matchesDirectory() {
  const directory = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  if (!directory) return null;
  if (!isAbsolute(directory)) throw new Error("MINTONIX_LOCAL_MATCHES_DIR must be an absolute path");
  return directory;
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Only publish matches with a valid match file. Video plays from its YouTube source. */
export async function listLocalMatches(): Promise<Match[]> {
  const directory = matchesDirectory();
  if (!directory) return [];
  let entries;
  try {
    entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results = await Promise.allSettled(entries
    .filter((entry) => entry.isDirectory() && matchIdPattern.test(entry.name))
    .map((entry) => readLocalMatch(entry.name)));
  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort((a, b) => a.matchId.localeCompare(b.matchId));
}

export async function readLocalMatch(matchId: string): Promise<Match | null> {
  const directory = matchesDirectory();
  if (!directory || !matchIdPattern.test(matchId)) return null;
  const input = await readJson(join(directory, matchId, "match.json"));
  if (input === null) return null;
  const match = parseMatch(input);
  if (match.matchId !== matchId) throw new Error("Local match ID does not match its directory");
  return match;
}

/** Shot data for a match, or null when the match has none. */
export async function readLocalAnalysis(match: Match): Promise<MatchAnalysis | null> {
  const directory = matchesDirectory();
  if (!directory) return null;
  const input = await readJson(join(directory, match.matchId, "analysis.json"));
  return input === null ? null : parseAnalysis(input, match);
}

/** Whether a match has an analysis file, without reading it. */
export async function hasLocalAnalysis(match: Match) {
  const directory = matchesDirectory();
  if (!directory) return false;
  try {
    await access(/*turbopackIgnore: true*/ join(directory, match.matchId, "analysis.json"));
    return true;
  } catch {
    return false;
  }
}
