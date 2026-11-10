import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { formatPostDate, getPost, getPosts } from "@/components/blog/posts";
import { JsonLd } from "@/components/site/json-ld";
import { absoluteUrl, pageMetadata, site } from "@/components/site/site";
import styles from "@/components/blog/blog.module.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return pageMetadata({ title: post.title, description: post.description, path: `/blog/${post.slug}`, publishedTime: post.date });
}

export default function BlogPostPage({ params }: Props) {
  return (
    <main id="main" className={styles.articlePage}>
      <Link className={styles.backLink} href="/blog"><span aria-hidden="true">←</span> All notes</Link>
      <Suspense fallback={<ArticleSkeleton />}>
        <ArticleContent params={params} />
      </Suspense>
    </main>
  );
}

async function ArticleContent({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const url = absoluteUrl(`/blog/${post.slug}`);
  const publisher = { "@type": "Organization", name: site.name, url: absoluteUrl("/"), logo: absoluteUrl(site.logo) };
  return (
    <article>
      <JsonLd data={{ "@type": "BlogPosting", headline: post.title, description: post.description, datePublished: post.date, articleSection: post.category, inLanguage: "en", url, mainEntityOfPage: url, author: publisher, publisher }} />
      <header className={styles.articleHeading}>
        <p className={styles.eyebrow}>{post.category}</p>
        <h1>{post.title}</h1>
        <p className={styles.articleDescription}>{post.description}</p>
        <p className={styles.postMeta}>From the founder, <time dateTime={post.date}>{formatPostDate(post.date)}</time>, {post.readingMinutes} min read</p>
      </header>
      <div className={styles.prose}><Markdown skipHtml>{post.body}</Markdown></div>
    </article>
  );
}

function ArticleSkeleton() {
  return (
    <article aria-busy="true" aria-label="Loading article">
      <header className={styles.articleHeading}>
        <p className={styles.eyebrow} role="status">Loading article…</p>
        <div className={styles.skeletonTitle} aria-hidden="true"><span /><span /></div>
        <div className={styles.skeletonText} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.skeletonMeta} aria-hidden="true" />
      </header>
      <div className={styles.skeletonBody} aria-hidden="true">
        <div className={styles.skeletonText}><span /><span /><span /><span /></div>
        <div className={styles.skeletonText}><span /><span /><span /><span /></div>
      </div>
    </article>
  );
}
