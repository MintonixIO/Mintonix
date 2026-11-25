"use client";

import { useId, useMemo } from "react";
import type { Match, MatchAnalysis } from "./contract";
import { playerTools } from "./analysis/players";
import { headToHead, scoreFlow, type GameFlow } from "./match-stats";
import styles from "./match-stats.module.css";

const FLOW_HEIGHT = 72;
const SLOT = 10;

/** One game's lead, rally by rally: the first player's lead above the axis, the second's below. */
function FlowChart({ flow, scale, names, onSelectRally }: {
  flow: GameFlow;
  scale: number;
  names: [string, string];
  onSelectRally: (index: number) => void;
}) {
  const clip = useId();
  const { points } = flow;
  const width = Math.max(1, points.length - 1) * SLOT;
  const mid = FLOW_HEIGHT / 2;
  const y = (lead: number) => mid - (lead / scale) * (mid - 4);
  const line = points.map((point, i) => `${i ? "L" : "M"}${i * SLOT},${y(point.lead)}`).join("");
  const area = points.length ? `${line}L${(points.length - 1) * SLOT},${mid}L0,${mid}Z` : "";
  const leads = points.map((point) => point.lead);
  const summary = points.length
    ? `Game ${flow.game}${flow.final ? `, ${flow.final}` : ""}. Biggest leads: ${names[0]} by ${Math.max(0, ...leads)}, ${names[1]} by ${Math.max(0, ...leads.map((lead) => -lead))}.`
    : `Game ${flow.game}: no scores detected.`;
  return (
    <div className={styles.flowRow}>
      <span className={styles.flowGame}>G{flow.game}</span>
      <svg className={styles.flow} viewBox={`-2 0 ${width + 4} ${FLOW_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        <defs>
          <clipPath id={`${clip}-a`}><rect x={-2} y={0} width={width + 4} height={mid} /></clipPath>
          <clipPath id={`${clip}-b`}><rect x={-2} y={mid} width={width + 4} height={mid} /></clipPath>
        </defs>
        <line className={styles.axis} x1={-2} x2={width + 2} y1={mid} y2={mid} />
        {area && <path className={styles.areaA} d={area} clipPath={`url(#${clip}-a)`} />}
        {area && <path className={styles.areaB} d={area} clipPath={`url(#${clip}-b)`} />}
        {line && <path className={styles.line} d={line} />}
        {points.map((point, i) => point.index !== null && (
          // Pointer shortcut only: the control bar's rally strip is the keyboard path to the same rallies.
          <rect key={point.index} className={styles.slot} x={i * SLOT - SLOT / 2} y={0} width={SLOT} height={FLOW_HEIGHT}
            onClick={() => onSelectRally(point.index!)}><title>{`Rally ${point.index + 1}`}</title></rect>
        ))}
      </svg>
      <span className={styles.flowFinal}>{flow.final ?? "–"}</span>
    </div>
  );
}

/** Whole-match numbers under the viewer: how the score moved, and the two players side by side. */
export function MatchStats({ match, analysis, onSelectRally }: { match: Match; analysis?: MatchAnalysis; onSelectRally: (index: number) => void }) {
  const players = playerTools(match);
  const [first, second] = match.players;
  const names: [string, string] = [players.shortName(first.id), players.shortName(second.id)];
  const flows = useMemo(() => scoreFlow(match, analysis), [match, analysis]);
  const rows = useMemo(() => headToHead(match, analysis), [match, analysis]);
  const scale = Math.max(5, ...flows.flatMap((flow) => flow.points.map((point) => Math.abs(point.lead))));
  if (!flows.some((flow) => flow.points.length) && !rows.length) return null;
  return (
    <section className={styles.stats} aria-label="Match statistics">
      <div className={styles.panel}>
        <h2 className={styles.heading}>Score flow</h2>
        <p className={styles.legend}>
          <span data-tone="a"><span className={styles.dot} aria-hidden="true" />{names[0]} ahead</span>
          <span data-tone="b"><span className={styles.dot} aria-hidden="true" />{names[1]} ahead</span>
        </p>
        {flows.map((flow) => <FlowChart key={flow.game} flow={flow} scale={scale} names={names} onSelectRally={onSelectRally} />)}
      </div>
      {rows.length > 0 && (
        <div className={styles.panel}>
          <h2 className={styles.heading}>Head to head</h2>
          <p className={styles.legend}>
            <span data-tone="a"><span className={styles.dot} aria-hidden="true" />{names[0]}</span>
            <span data-tone="b">{names[1]}<span className={styles.dot} aria-hidden="true" /></span>
          </p>
          <dl className={styles.rows}>
            {rows.map((row) => {
              const total = row.values[0] + row.values[1];
              const share = total ? (row.values[0] / total) * 100 : 50;
              const shown = (i: 0 | 1) => `${row.detail?.[i] ?? row.values[i]}${row.unit ? ` ${row.unit}` : ""}`;
              return (
                <div key={row.label} className={styles.row}>
                  <dt>{row.label}{row.tag && <span className={styles.tag} title={row.tag === "est" ? "Estimated from the broadcast" : "A model's inference"}>{row.tag}</span>}</dt>
                  <dd>
                    <span className={styles.value}>{shown(0)}</span>
                    <span className={styles.split} aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                    <span className={styles.value}>{shown(1)}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </section>
  );
}
