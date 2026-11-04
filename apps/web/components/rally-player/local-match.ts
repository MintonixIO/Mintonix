import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseRallyManifest } from "./timeline.ts";

const matchIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Only publish matches with a valid manifest. Video plays from the manifest's YouTube source. */
export async function listLocalMatches() {
  const directory = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  if (!directory) return [];
  if (!isAbsolute(directory)) throw new Error("MINTONIX_LOCAL_MATCHES_DIR must be an absolute path");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results = await Promise.allSettled(entries
    .filter((entry) => entry.isDirectory() && matchIdPattern.test(entry.name))
    .map((entry) => readLocalMatch(entry.name)));
  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value.manifest] : [])
    .sort((a, b) => a.matchId.localeCompare(b.matchId));
}

/** Local manifests are opt-in and stay outside both Git and the client bundle. No media is read or served. */
export async function readLocalMatch(matchId: string) {
  const directory = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  if (!directory || !matchIdPattern.test(matchId)) return null;
  if (!isAbsolute(directory)) throw new Error("MINTONIX_LOCAL_MATCHES_DIR must be an absolute path");
  try {
    const text = await readFile(join(directory, matchId, "manifest.json"), "utf8");
    const manifest = parseRallyManifest(JSON.parse(text));
    if (manifest.matchId !== matchId) throw new Error("Local manifest match ID does not match its directory");
    return { manifest };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
