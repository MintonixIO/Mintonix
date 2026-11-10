import styles from "./match-link-form.module.css";

/**
 * Processing a new match from its link isn't built yet. The field shows what is
 * planned, disabled, so nobody submits a link and waits for a result.
 */
export function MatchLinkForm() {
  return (
    <div className={styles.container}>
      <div className={styles.form}>
        <label htmlFor="match-link" className={styles.label}>Your own match <span className={styles.soon}>Coming soon</span></label>
        <div className={styles.inputRow} data-disabled>
          <svg className={styles.linkIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4.24 4.24 0 0 1-6-6l4-4a4.24 4.24 0 0 1 6 0m2 10a4.24 4.24 0 0 0 6 0l4-4a4.24 4.24 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)" /></svg>
          <input id="match-link" name="matchLink" type="url" disabled placeholder="Paste a BWF match link…" aria-describedby="match-link-note" />
        </div>
        <p id="match-link-note" className={styles.note}>Processing a new match from its link isn’t available yet. For now, the demo match is the one to explore.</p>
      </div>
    </div>
  );
}
