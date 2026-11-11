import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { listLocalMatches } from "@/components/rally-player/local-match";
import { Brand } from "@/components/ui/brand";
import { site, type SocialPlatform } from "./site";
import styles from "./site.module.css";

/** Opens the demo match in the viewer; the library stands in while none is available. */
async function ViewerLink() {
  await io();
  const [match] = await listLocalMatches();
  return <Link href={match ? `/watch/${match.matchId}` : "/library"}>Rally viewer</Link>;
}

/** `wide` follows the match viewer's full-width shell instead of the site column. */
export function SiteFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className={styles.footer} data-wide={wide || undefined}>
      <div className={styles.footerTop}>
        <div className={styles.footerIdentity}>
          <Brand />
          <p>Watch the rally.<br /><span>Read the game.</span></p>
          <span className={styles.footerDescription}>A closer look at the game, one rally at a time.</span>
          <ul className={styles.socials} aria-label="Social profiles">
            {site.socials.map(({ platform, url }) => (
              <li key={platform}>
                <a href={url} target="_blank" rel="noopener noreferrer me" aria-label={`Mintonix on ${platform}`} title={platform}><SocialIcon platform={platform} /></a>
              </li>
            ))}
          </ul>
        </div>
        <nav className={styles.footerLinks} aria-labelledby="footer-explore">
          <h2 id="footer-explore">Explore</h2>
          <Suspense fallback={<Link href="/library">Rally viewer</Link>}><ViewerLink /></Suspense>
          <Link href="/library">Library</Link>
          <Link href="/blog">Blog</Link>
        </nav>
      </div>
      <div className={styles.footerBottom}>
        <span>© 2026 Mintonix</span>
        <span className={styles.independent}>Independent project. Not affiliated with BWF.</span>
        <a href="#top">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  );
}

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {platform === "X" && <><path d="M5 4h4l10 16h-4L5 4Z" /><path d="M19 4 5 20" /></>}
      {platform === "Threads" && <path d="M19 8c-.7-3.4-3-5-6.8-5C6.7 3 4 6 4 12s2.7 9 8.2 9c4.4 0 7.8-2.2 7.8-6.1 0-2.8-2-4.9-6.4-4.9-3.4 0-5.2 1.4-5.2 3.5 0 1.8 1.3 2.9 3 2.9 2.6 0 4.3-1.8 4.3-5.1 0-2.4-1.3-4-3.6-4-1.1 0-2 .4-2.7 1" />}
      {platform === "YouTube" && <><rect x="3" y="5" width="18" height="14" rx="4" /><path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" /></>}
      {platform === "Instagram" && <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></>}
    </svg>
  );
}
