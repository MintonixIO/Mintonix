import { notFound } from "next/navigation";
import { formatPostDate, getPost, getPosts } from "@/components/blog/posts";
import { shareImage, shareImageSize, shareImageType } from "@/components/site/share-image";

export const alt = "Mintonix blog article";
export const size = shareImageSize;
export const contentType = shareImageType;

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return shareImage({ eyebrow: post.category, title: post.title, detail: formatPostDate(post.date) });
}
