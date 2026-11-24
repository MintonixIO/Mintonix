import { listLocalMatches, readLocalMatch } from "@/components/rally-player/local-match";
import { listLocalRallyMotion, readLocalRallyMotion } from "@/components/rally-player/local-rally-files";

/**
 * One rally's player skeletons and running distance, for the live court. Every rally
 * file is prerendered at build (generateStaticParams), so they are served as static files.
 * Rally files are excluded from server-function tracing (next.config.ts; they total ~100 MB),
 * so any other rally reads nothing at request time and is a 404.
 */

export async function generateStaticParams() {
  const matches = await listLocalMatches();
  const params = await Promise.all(matches.map(async (match) =>
    (await listLocalRallyMotion(match)).map((rallyId) => ({ matchId: match.matchId, rallyId }))));
  return params.flat();
}

async function rallyMotion(matchId: string, rallyId: string) {
  "use cache";
  const match = await readLocalMatch(matchId);
  return match && await readLocalRallyMotion(match, rallyId);
}

export async function GET(_request: Request, { params }: RouteContext<"/api/matches/[matchId]/rallies/[rallyId]">) {
  const { matchId, rallyId } = await params;
  const motion = await rallyMotion(matchId, rallyId);
  if (!motion) return Response.json({ error: "No player motion for this rally." }, { status: 404 });
  return Response.json(motion);
}
