import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import styles from "./site.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Brand />
      <nav className={styles.navigation} aria-label="Main navigation">
        <Link href="/blog" className={styles.blogLink}>Blog</Link>
        <span className={styles.previewBadge}><i aria-hidden="true" /> Early preview</span>
      </nav>
    </header>
  );
}
