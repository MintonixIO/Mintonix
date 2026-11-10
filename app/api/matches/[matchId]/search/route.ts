import { handleSearchRequest } from "@/components/rally-player/search/service";

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  return handleSearchRequest(request, (await params).matchId);
}
