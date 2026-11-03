import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { parseByteRange } from "@/components/rally-player/byte-range";
import { readLocalMatch } from "@/components/rally-player/local-match";

type Context = { params: Promise<{ matchId: string }> };

async function serve(request: Request, context: Context) {
  const match = await readLocalMatch((await context.params).matchId);
  if (!match) return new Response(null, { status: 404 });
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });
  const range = parseByteRange(request.headers.get("range"), match.videoSize);
  if (!range) {
    headers.set("Content-Range", `bytes */${match.videoSize}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Length", String(range.end - range.start + 1));
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${match.videoSize}`);
  const body = request.method === "HEAD" ? null : Readable.toWeb(createReadStream(match.videoPath, {
    start: range.start, end: range.end, signal: request.signal,
  })) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range.partial ? 206 : 200, headers });
}

export const GET = serve;
export const HEAD = serve;
