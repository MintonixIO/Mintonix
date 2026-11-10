"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatTime } from "../timeline";
import type { SearchTarget } from "./intent";
import type { SearchResponse, SearchResult } from "./rank";
import styles from "./search.module.css";

const examples = ["An intense rally", "Fast smashes", "A long rally in game 3"];
const targets: { value: SearchTarget; label: string }[] = [
  { value: "all", label: "All" },
  { value: "rallies", label: "Rallies" },
  { value: "shots", label: "Shots" },
];
const FAILED = "Search didn’t finish. Try again.";

/** The measured flight from above, far end on the left like the analysis court. */
function FlightPreview({ paths }: { paths: SearchResult["paths"] }) {
  return (
    <svg viewBox="-.5 -.5 14.4 7.1" className={styles.court} data-empty={paths.length === 0 || undefined} role="img" aria-label={paths.length ? "Measured flight, seen from above" : "No reliable flight measured"}>
      <rect x="0" y="0" width="13.4" height="6.1" rx=".1" />
      <path d="M0 .46H13.4M0 5.64H13.4M4.72 0V6.1M8.68 0V6.1M0 3.05H4.72M8.68 3.05H13.4" />
      <path d="M6.7 -.3V6.4" className={styles.net} />
      {paths.map((path, i) => <polyline className={styles.flight} key={i} points={path.map(([x, y]) => `${y},${6.1 - x}`).join(" ")} />)}
      {paths.length > 0 && <circle className={styles.contact} cx={paths[0][0][1]} cy={6.1 - paths[0][0][0]} r=".22" />}
    </svg>
  );
}

function Result({ result, onSelect }: { result: SearchResult; onSelect: (result: SearchResult) => void }) {
  const shot = result.kind === "shot";
  return (
    <button className={styles.result} type="button" data-near={!result.fits || undefined} onClick={() => onSelect(result)}>
      <FlightPreview paths={result.paths} />
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.title}>{result.title}{result.player && <span> {result.player}</span>}</span>
          <span className={styles.percent}>{result.matchPercent}%<span> {result.fits ? "match" : "near match"}</span></span>
        </span>
        <span className={styles.meta}>
          {shot && <span>Rally {result.rallyIndex + 1}</span>}
          <span>Game {result.game}</span>
          {result.score && <span>{result.score}</span>}
          <span>{formatTime(result.startSeconds)}</span>
          {shot
            ? <span>{result.speedKmh !== null ? `${Math.round(result.speedKmh)} km/h` : "Speed not measured"}</span>
            : <><span>{Math.round(result.seconds)}s of play</span>{result.shotCount !== null && <span>{result.shotCount} strokes</span>}</>}
        </span>
        {!shot && result.sequence.length > 0 && <span className={styles.sequence}>{result.sequence.join(" → ")}{(result.shotCount ?? 0) > result.sequence.length && " → …"}</span>}
        {result.typeConfidence !== null && <span className={styles.detail}>{result.typeCorrected ? "Type corrected by the measured flight" : `Type inferred by the model, ${Math.round(result.typeConfidence * 100)}% confident${result.typeUncertain ? " (uncertain)" : ""}`}</span>}
        {result.quality && result.quality !== "ok" && <span className={styles.warning}>Flight estimate: {result.quality}</span>}
        {result.reasons.length > 0 && <span className={styles.reasons}>{result.reasons.map((reason) => <span key={reason}>{reason}</span>)}</span>}
        {result.missing.length > 0 && <span className={styles.warning}>Not confirmed: {result.missing.join("; ")}</span>}
        <span className={styles.open}>{shot ? "Open 3D replay" : "Play rally"}</span>
      </span>
    </button>
  );
}

export function SearchPanel({ matchId, onSelect }: { matchId: string; onSelect: (result: SearchResult) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<SearchTarget>("all");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  useEffect(() => () => active.current?.abort(), []);

  async function search(value: string, kind: SearchTarget) {
    const clean = value.trim();
    if (clean.length < 2) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const number = ++requestNumber.current;
    setQuery(value); setTarget(kind); setSubmitted(clean); setBusy(true); setError(""); setResponse(null);
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const result = await fetch(`/api/matches/${encodeURIComponent(matchId)}/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean, target: kind }), signal: controller.signal,
      });
      // A gateway error page is not JSON; it must not surface a parser message.
      const body = await result.json().catch(() => null);
      if (!result.ok || !body) throw new Error(body?.error || FAILED);
      if (number === requestNumber.current) setResponse(body as SearchResponse);
    } catch (cause) {
      if (number === requestNumber.current) setError(controller.signal.aborted ? "Search took too long. Try again." : cause instanceof Error ? cause.message : FAILED);
    } finally {
      window.clearTimeout(timer);
      if (number === requestNumber.current) setBusy(false);
    }
  }

  function clear() {
    active.current?.abort();
    requestNumber.current++;
    setQuery(""); setSubmitted(""); setResponse(null); setError(""); setBusy(false);
  }

  return (
    <section className={styles.search} aria-label="Search this match">
      <form className={styles.form} role="search" onSubmit={(event) => { event.preventDefault(); void search(query, target); }}>
        <label className={styles.field}>
          <span className={styles.srOnly}>Describe a rally or shot</span>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input type="search" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Describe a rally or shot in this match" minLength={2} maxLength={400} required autoComplete="off" />
        </label>
        <div className={styles.targets} role="group" aria-label="Search for">
          {targets.map((option) => (
            <button key={option.value} type="button" aria-pressed={target === option.value} onClick={() => { if (submitted) void search(submitted, option.value); else setTarget(option.value); }}>{option.label}</button>
          ))}
        </div>
        <button className={styles.submit} type="submit" disabled={busy || query.trim().length < 2}>{busy ? "Searching…" : "Search"}</button>
      </form>

      {!submitted && (
        <div className={styles.examples}>
          <span id={`${id}-try`}>Try</span>
          <ul aria-labelledby={`${id}-try`}>{examples.map((example) => <li key={example}><button type="button" onClick={() => { void search(example, target); }}>{example}</button></li>)}</ul>
        </div>
      )}

      <p role="status" className={styles.srOnly}>{busy ? "Searching…" : response ? `${response.results.length} results for ${submitted}` : ""}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {response && (
        <div className={styles.response}>
          <div className={styles.summary}>
            <div>
              <p>{response.message}</p>
              {response.interpretation.map((line) => <p className={styles.note} key={line}>{line}</p>)}
            </div>
            <button type="button" onClick={clear}>Clear search</button>
          </div>
          <ol className={styles.results}>
            {response.results.map((result) => <li key={result.id}><Result result={result} onSelect={onSelect} /></li>)}
          </ol>
          {response.notices.map((notice) => <p className={styles.note} key={notice}>{notice}</p>)}
        </div>
      )}
    </section>
  );
}
