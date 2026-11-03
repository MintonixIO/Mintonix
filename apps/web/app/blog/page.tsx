import type { Metadata } from "next";
import Link from "next/link";
import { formatPostDate, getPosts } from "@/components/blog/posts";
import styles from "@/components/blog/blog.module.css";

export const metadata: Metadata = {
  title: "Blogs",
  description: "Finding rally boundaries, handling broadcast replays, and getting the player to jump to the right point.",
};

export default function BlogPage() {
  const posts = getPosts();
  return (
    <main id="main" className={styles.blog}>
      <header className={styles.blogHeading}>
        <h1>Building Mintonix</h1>
        <p>Finding rally boundaries, handling broadcast replays, and getting the player to jump to the right point.</p>
      </header>
      <div className={styles.listHeading}><span>TECHNICAL NOTES</span><span>{String(posts.length).padStart(2, "0")} ARTICLES</span></div>
      <div className={styles.postList}>
        {posts.map((post, index) => (
          <Link className={styles.postCard} href={`/blog/${post.slug}`} key={post.slug}>
            <span className={styles.postNumber}>{String(index + 1).padStart(2, "0")} /</span>
            <div className={styles.postSummary}>
              <span className={styles.category}>{post.category}</span>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <div className={styles.postMeta}><time dateTime={post.date}>{formatPostDate(post.date)}</time><span>·</span><span>{post.readingMinutes} min read</span></div>
            </div>
            <span className={styles.postArrow} aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
