import Link from "next/link";
import { MatchLinkForm } from "@/components/match-link/match-link-form";
import { DemoAction } from "@/components/home/demo-action";
import { RallyDemo } from "@/components/home/rally-demo";
import { FeaturedMatch } from "@/components/home/featured-match";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import { JsonLd } from "@/components/site/json-ld";
import { absoluteUrl, pageMetadata, site } from "@/components/site/site";
import styles from "./home.module.css";

export const metadata = pageMetadata({ description: site.description, path: "/" });

const organization = { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: site.name, url: absoluteUrl("/"), logo: absoluteUrl(site.logo) };
const website = { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: site.name, url: absoluteUrl("/"), description: site.description, inLanguage: "en", publisher: { "@id": organization["@id"] } };

export default function Home() {
  return (
    <main id="main">
      <JsonLd data={{ "@graph": [organization, website] }} />
      <section id="generate" className={styles.hero} aria-labelledby="page-title">
        <div className={styles.heroCopy}>
          <h1 id="page-title">Watch the rally.<br /><span>Read the game.</span></h1>
          <p className={styles.heroDescription}>Your favorite rallies. A closer look at every shot.</p>
          <DemoAction />
          <MatchLinkForm />
        </div>

        <RallyDemo />

        <a href="#possibilities" className={styles.scrollArrow} aria-label="Explore Mintonix features"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></a>
      </section>

      <FeatureShowcase viewer={<FeaturedMatch />} />

      <section className={styles.closing} aria-labelledby="closing-heading">
        <h2 id="closing-heading">Pick a match and start watching.</h2>
        <Link className={styles.demoButton} href="/library">Browse the library</Link>
      </section>
    </main>
  );
}
