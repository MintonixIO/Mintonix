import Link from "next/link";
import { MatchLinkForm } from "@/components/match-link/match-link-form";
import { RallyDemo } from "@/components/home/rally-demo";
import { FeaturedMatch } from "@/components/home/featured-match";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main id="main">
      <section id="generate" className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <h1 id="page-title">Watch the rally.<br /><span>Read the game.</span></h1>
          <p className={styles.heroDescription}>Your favorite rallies. A closer look at every shot.</p>
          <MatchLinkForm />
          <p className={styles.previewNote}>Early preview · Match-link processing is coming soon.</p>
          <p className={styles.localMatch}>
            <Link href="/library"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>Library</Link>
            <span>Try the viewer with an available match</span>
          </p>
        </div>

        <RallyDemo />

        <a href="#possibilities" className={styles.scrollArrow} aria-label="Explore Mintonix features"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></a>
      </section>

      <FeatureShowcase viewer={<FeaturedMatch />} />
    </main>
  );
}
