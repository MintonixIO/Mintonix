import type { Match, Shot } from "../contract";
import { formatTime } from "../timeline";
import { playerTools, value } from "./players";
import { shotTypeView } from "./shot-types";
import { formatShotParam, kmh, qualityNote } from "./shots";
import styles from "./analysis.module.css";

/** One shot in an expanded rally of the match rail; opening it shows the 3D replay, which doesn't need the video to be ready. */
export function ShotRow({ match, shot, index, rallyId, current, live, showType, onSelect }: {
  match: Match; shot: Shot; index: number; rallyId: string; current: boolean; live: boolean; showType: boolean; onSelect: () => void;
}) {
  const type = showType ? shotTypeView(shot) : null;
  const players = playerTools(match);
  const unreliable = shot.quality === "unreliable";
  const approx = shot.quality === "guessed" ? "≈" : "";
  return (
    <button
      type="button"
      className={styles.shotRow}
      data-shot={formatShotParam({ rallyId, index })}
      aria-current={current ? "true" : undefined}
      data-quality={shot.quality}
      title={qualityNote(shot) ?? undefined}
      data-typed={showType || undefined}
      aria-label={`Shot ${index + 1} by ${players.name(shot.hitter)}${type ? `, ${type.confident ? "" : "possibly "}${type.label.toLowerCase()}` : ""}${unreliable ? ", not measured reliably" : `, ${kmh(shot.speed) ?? "unknown"} km/h`}, at ${formatTime(shot.startSeconds)}. Replay in 3D.`}
      onClick={onSelect}
    >
      <span className={styles.shotNumber}>{live ? <span className={styles.liveDot} aria-hidden="true" /> : index + 1}</span>
      <span className={styles.shotPlayer} data-tone={players.tone(shot.hitter)}>{players.shortName(shot.hitter)}</span>
      {showType && <span className={styles.shotType} data-confident={type?.confident || undefined}>{type ? `${type.short}${type.confident ? "" : "?"}` : ""}</span>}
      <span>{unreliable ? "–" : `${approx}${value(kmh(shot.speed))}`}</span>
      <span>{unreliable ? "–" : `${approx}${value(shot.apex, 1)} m`}</span>
    </button>
  );
}
