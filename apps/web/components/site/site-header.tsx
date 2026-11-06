import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import styles from "./site.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Brand />
      <nav className={styles.navigation} aria-label="Main navigation">
        <Link href="/library" className={styles.navLink}>Library</Link>
        <Link href="/blog" className={styles.navLink}>Blog</Link>
        <span className={styles.previewBadge}><i aria-hidden="true" /><span className={styles.previewLong}>Early preview</span><span className={styles.previewShort} aria-hidden="true">Preview</span></span>
      </nav>
    </header>
  );
}
