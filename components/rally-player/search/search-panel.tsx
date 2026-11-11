"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatTime } from "../timeline";
import type { SearchResponse, SearchResult } from "./rank";
import styles from "./search.module.css";

const examples = ["An intense rally", "Fast smashes", "A long rally in game 3"];
const FAILED = "Search didn’t finish. Try again.";
const TYPING_PAUSE_MS = 280;

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

function Result({ result, flagNear, onSelect }: { result: SearchResult; flagNear: boolean; onSelect: (result: SearchResult) => void }) {
  const shot = result.kind === "shot";
  return (
    <button className={styles.result} type="button" data-near={(flagNear && !result.fits) || undefined} onClick={() => onSelect(result)}>
      <FlightPreview paths={result.paths} />
      <span className={styles.body}>
        <span className={styles.title}>
          {result.title}{result.typeUncertain && "?"}{result.player && <span> {result.player}</span>}
          {flagNear && !result.fits && <span className={styles.near}>near match</span>}
        </span>
        <span className={styles.meta}>
          <span>Game {result.game}</span>
          {result.score && <span>{result.score}</span>}
          <span>{formatTime(result.startSeconds)}</span>
          {shot
            ? <span>{result.speedKmh !== null ? `${Math.round(result.speedKmh)} km/h` : "Speed not measured"}</span>
            : <><span>{Math.round(result.seconds)}s</span>{result.shotCount !== null && <span>{result.shotCount} strokes</span>}</>}
        </span>
        {!shot && result.sequence.length > 0 && <span className={styles.sequence}>{result.sequence.join(" → ")}{(result.shotCount ?? 0) > result.sequence.length && " → …"}</span>}
        {result.quality && result.quality !== "ok" && <span className={styles.warning}>Flight estimate: {result.quality}</span>}
        {result.missing.length > 0 && <span className={styles.warning}>Not confirmed: {result.missing.join("; ")}</span>}
      </span>
      <span className={styles.srOnly}>{shot ? "Open 3D replay" : "Play rally"}</span>
    </button>
  );
}

/**
 * One field. Suggestions open beneath it while typing (keyword matching, free); the keyboard's
 * search key asks the language model for a closer reading. They open in the page flow, pushing
 * the video down: nothing is ever drawn over the embedded player.
 */
export function SearchPanel({ matchId, onSelect }: { matchId: string; onSelect: (result: SearchResult) => void }) {
  const id = useId();
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const typing = useRef<number | undefined>(undefined);
  useEffect(() => () => { active.current?.abort(); window.clearTimeout(typing.current); }, []);

  async function search(value: string, instant: boolean) {
    const clean = value.trim();
    window.clearTimeout(typing.current);
    if (clean.length < 2) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const number = ++requestNumber.current;
    setBusy(true); setError("");
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const result = await fetch(`/api/matches/${encodeURIComponent(matchId)}/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean, instant }), signal: controller.signal,
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

  function type(value: string) {
    setQuery(value);
    setOpen(true);
    window.clearTimeout(typing.current);
    if (value.trim().length < 2) {
      active.current?.abort();
      requestNumber.current++;
      setResponse(null); setError(""); setBusy(false);
      return;
    }
    typing.current = window.setTimeout(() => { void search(value, true); }, TYPING_PAUSE_MS);
  }

  function clear() {
    type("");
    inputRef.current?.focus();
  }

  function pick(result: SearchResult) {
    // Close the list so the video sits right under the field again.
    setOpen(false);
    inputRef.current?.blur();
    onSelect(result);
  }

  // "Near match" only means something beside results that do fit.
  const someFit = response?.results.some((result) => result.fits) ?? false;
  const showExamples = open && query.trim().length < 2;
  const showResults = open && !showExamples && (response !== null || error !== "");
  return (
    <section ref={rootRef} className={styles.search} aria-label="Search this match"
      onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); inputRef.current?.blur(); } }}>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setOpen(true); void search(query, false); }}>
        <label className={styles.field} data-busy={busy || undefined}>
          <span className={styles.srOnly}>Describe a rally or shot</span>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input ref={inputRef} type="search" enterKeyHint="search" value={query} onChange={(event) => type(event.target.value)} onFocus={() => setOpen(true)}
            placeholder="Find a rally or shot" maxLength={400} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={showExamples || showResults} />
          {query && <button type="button" className={styles.clear} aria-label="Clear search" onClick={clear}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}
        </label>
      </form>

      <p role="status" className={styles.srOnly}>{busy ? "Searching…" : response && query ? `${response.results.length} results` : ""}</p>

      {/* Keep the field focused while a suggestion is pressed, so the list is still there for the click. */}
      <div id={`${id}-list`} className={styles.list} hidden={!showExamples && !showResults} onMouseDown={(event) => event.preventDefault()}>
        {showExamples && (
          <ul className={styles.examples} aria-label="Example searches">
            {examples.map((example) => <li key={example}><button type="button" onClick={() => { setQuery(example); setOpen(true); void search(example, false); }}>{example}</button></li>)}
          </ul>
        )}
        {showResults && error && <p className={styles.error} role="alert">{error}</p>}
        {showResults && response && (response.results.length > 0 ? (
          <>
            <ol className={styles.results}>
              {response.results.map((result) => <li key={result.id}><Result result={result} flagNear={someFit} onSelect={pick} /></li>)}
            </ol>
            <p className={styles.note}>Stroke types are inferred by a model and not checked by hand; “?” marks a low-confidence pick.</p>
          </>
        ) : <p className={styles.note}>{response.message}</p>)}
      </div>
    </section>
  );
}
