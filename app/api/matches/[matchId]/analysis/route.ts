import { readLocalAnalysis, readLocalMatch } from "@/components/rally-player/local-match";

/** Shot data for the analyze view, fetched only when a visitor opens it. */
export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = await readLocalMatch(matchId);
  const analysis = match && await readLocalAnalysis(match);
  if (!analysis) return Response.json({ error: "No shot data for this match." }, { status: 404 });
  return Response.json(analysis);
}
