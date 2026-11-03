"use client";

import { useState, type FormEvent } from "react";
import styles from "./match-link-form.module.css";

export function MatchLinkForm() {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    try {
      const url = new URL(link.trim());
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname) throw new Error("Invalid match link");
    } catch {
      setError("Enter a full match video link, starting with https://.");
      return;
    }
    setError("");
    setSubmitted(true);
  }

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label htmlFor="match-link" className={styles.label}>BWF match video link</label>
        <div className={`${styles.inputRow} ${error ? styles.invalid : ""}`}>
          <svg className={styles.linkIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4.24 4.24 0 0 1-6-6l4-4a4.24 4.24 0 0 1 6 0m2 10a4.24 4.24 0 0 0 6 0l4-4a4.24 4.24 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)" /></svg>
          <input id="match-link" name="matchLink" type="url" inputMode="url" autoComplete="url" spellCheck={false} placeholder="Paste a BWF match link…" value={link} onChange={(event) => { setLink(event.target.value); setError(""); setSubmitted(false); }} aria-invalid={Boolean(error)} aria-describedby={error ? "match-link-error" : undefined} />
          <button type="submit">Generate view <span aria-hidden="true">↗</span></button>
        </div>
        {error && <p id="match-link-error" role="alert" className={styles.error}>{error}</p>}
        {submitted && <div className={styles.feedback} role="status"><p>Match generation isn’t connected to this form yet. No processing job has been created.</p></div>}
      </form>
    </div>
  );
}
