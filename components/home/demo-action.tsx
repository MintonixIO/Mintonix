import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import { listLocalMatches } from "@/components/rally-player/local-match";
import styles from "@/app/(site)/home.module.css";

const playIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>;

/** The hero's main action opens a match that is really available; never a made-up one. */
async function AvailableDemo() {
  await io();
  const [match] = await listLocalMatches();
  if (!match) return <LibraryFallback />;
  return (
    <div className={styles.demoAction}>
      <Link className={styles.demoButton} href={`/watch/${match.matchId}`}>{playIcon}Try the demo</Link>
    </div>
  );
}

function LibraryFallback() {
  return (
    <div className={styles.demoAction}>
      <Link className={styles.demoButton} href="/library">{playIcon}Open the library</Link>
    </div>
  );
}

export function DemoAction() {
  return <Suspense fallback={<LibraryFallback />}><AvailableDemo /></Suspense>;
}
