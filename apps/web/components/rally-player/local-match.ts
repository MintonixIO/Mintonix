import "server-only";

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseRallyManifest } from "./timeline.ts";

/** Local media is opt-in and stays outside both Git and the client bundle. */
export async function readLocalMatch(matchId: string) {
  const directory = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  if (!directory || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(matchId)) return null;
  if (!isAbsolute(directory)) throw new Error("MINTONIX_LOCAL_MATCHES_DIR must be an absolute path");
  const videoPath = join(directory, matchId, "video.mp4");
  try {
    const [text, video] = await Promise.all([
      readFile(join(directory, matchId, "manifest.json"), "utf8"),
      stat(videoPath),
    ]);
    if (!video.isFile() || video.size === 0) return null;
    const manifest = parseRallyManifest(JSON.parse(text));
    if (manifest.matchId !== matchId) throw new Error("Local manifest match ID does not match its directory");
    return { manifest, videoPath, videoSize: video.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
