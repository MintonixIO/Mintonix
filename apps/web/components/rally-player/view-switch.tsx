"use client";

import { setView, useView, type View } from "./view";
import styles from "./analysis/analysis.module.css";

const options: { value: View; label: string }[] = [
  { value: "watch", label: "Watch" },
  { value: "analyze", label: "Analyze" },
];

/** Watch plays the rallies; Analyze adds measured shot data beside the same video. */
export function ViewSwitch() {
  const view = useView(true);
  return (
    <div className={styles.viewSwitch} role="group" aria-label="View">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
