import type { Metadata } from "next";
import Link from "next/link";
import { formatPostDate, getPosts } from "@/components/blog/posts";
import { pageMetadata } from "@/components/site/site";
import styles from "@/components/blog/blog.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description: "Notes on what Mintonix does today and where it is going: badminton rally detection, shot analysis and the viewer built on them.",
  path: "/blog",
});

export default function BlogPage() {
  const posts = getPosts();
  return (
    <main id="main" className={styles.blog}>
      <header className={styles.blogHeading}>
        <h1>Building Mintonix</h1>
        <p>Notes on what Mintonix does today and where it is going.</p>
      </header>
      <div className={styles.postList}>
        {posts.map((post) => (
          <Link className={styles.postCard} href={`/blog/${post.slug}`} key={post.slug}>
            <div className={styles.postSummary}>
              <span className={styles.category}>{post.category}</span>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <p className={styles.postMeta}><time dateTime={post.date}>{formatPostDate(post.date)}</time>, {post.readingMinutes} min read</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
