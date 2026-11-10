import { notFound } from "next/navigation";
import { readLocalMatch } from "@/components/rally-player/local-match";
import { shareImage, shareImageSize, shareImageType } from "@/components/site/share-image";

export const alt = "A badminton match on Mintonix, rally by rally";
export const size = shareImageSize;
export const contentType = shareImageType;

export default async function Image({ params }: { params: Promise<{ matchId: string }> }) {
  const match = await readLocalMatch((await params).matchId);
  if (!match) notFound();
  const [a, b] = match.players;
  return shareImage({ eyebrow: "Rally by rally", title: `${a.name} vs ${b.name}`, detail: match.title });
}
