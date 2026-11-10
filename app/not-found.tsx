import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import styles from "@/components/site/site.module.css";

export const metadata: Metadata = { title: "Page not found" };

/** Unknown URLs and missing matches or articles land here, with the site navigation intact. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className={`site-shell ${styles.notFound}`}>
        <h1>That one landed out.</h1>
        <p>There’s no page at this address. The link may be mistyped, or the match isn’t in the library yet.</p>
        <div className={styles.notFoundActions}>
          <Link className={styles.notFoundPrimary} href="/library">Browse the library</Link>
          <Link className={styles.notFoundSecondary} href="/">Back to home</Link>
        </div>
        <span className={styles.notFoundCode}>Error 404</span>
      </main>
      <SiteFooter />
    </>
  );
}
