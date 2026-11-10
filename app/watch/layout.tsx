import { SiteFooter } from "@/components/site/site-footer";
import styles from "./layout.module.css";

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>{children}<SiteFooter wide /></div>;
}
