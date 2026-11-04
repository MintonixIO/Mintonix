import styles from "./layout.module.css";

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
