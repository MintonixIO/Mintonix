import type { MatchAnalysis, Shot, ShotTypeName } from "../contract.ts";
import { COURT } from "./shots.ts";

/** Names for the 12 ShuttleSet stroke types: `label` in sentences and details, `short` in the rail. */
export const SHOT_TYPE_NAMES: Record<ShotTypeName, { label: string; short: string }> = {
  net_shot: { label: "Net shot", short: "Net shot" },
  return_net: { label: "Net return", short: "Net return" },
  smash: { label: "Smash", short: "Smash" },
  lift: { label: "Lift", short: "Lift" },
  clear: { label: "Clear", short: "Clear" },
  drive: { label: "Drive", short: "Drive" },
  drop: { label: "Drop", short: "Drop" },
  push: { label: "Push", short: "Push" },
  rush: { label: "Net kill", short: "Net kill" },
  cross_net: { label: "Cross-court net shot", short: "Cross net" },
  short_serve: { label: "Short serve", short: "Short serve" },
  long_serve: { label: "Long serve", short: "Long serve" },
};

/** Below this probability the model's pick is shown as a guess. */
export const CONFIDENT_PROBABILITY = 0.5;

export const percent = (probability: number) => `${Math.round(probability * 100)}%`;

/** How to show one shot's inferred type; null when the shot has none (net cords, or no model output). */
export function shotTypeView(shot: Shot) {
  const type = shot.shotType;
  if (!type) return null;
  const named = type.name !== null;
  return {
    name: type.name,
    label: named ? SHOT_TYPE_NAMES[type.name!].label : "Unclear",
    short: named ? SHOT_TYPE_NAMES[type.name!].short : "Unclear",
    // A physics correction rests on the measured flight, not on the model's probability.
    confident: named && (type.probability >= CONFIDENT_PROBABILITY || Boolean(type.correction)),
    corrected: Boolean(type.correction),
    probability: type.probability,
    runnerUp: SHOT_TYPE_NAMES[type.runnerUp].label,
    runnerUpProbability: type.runnerUpProbability,
  };
}

/** Why a corrected shot was relabelled, in plain language from its measured flight; null when it wasn't. */
export function correctionNote(shot: Shot) {
  const correction = shot.shotType?.correction;
  if (!correction) return null;
  const from = `${SHOT_TYPE_NAMES[correction.from].label} (${percent(correction.fromProbability)})`;
  const fact = {
    high_deep_flight: `it rose to ${shot.apex?.toFixed(1) ?? "over 3"} m and went ${(COURT.netY - shot.placement[1]).toFixed(1)} m past the net, which a push doesn’t`,
    underarm_contact: `it was hit from ${shot.contact[2].toFixed(1)} m, too low for an overhead clear`,
    flat_flight: `it peaked at ${shot.apex?.toFixed(1) ?? "under 2.5"} m, too flat for a clear`,
  }[correction.reason];
  return `The model said ${from}; corrected because ${fact}.`;
}

/** One line on how sure the model is, e.g. "Model: 93% · else Drive 4%"; "No clear stroke type" when it found none. */
export function shotTypeConfidence(shot: Shot) {
  const view = shotTypeView(shot);
  if (!view) return null;
  if (view.corrected) return "Corrected by the measured flight";
  if (view.name === null) return `No clear stroke type · closest ${view.runnerUp} ${percent(view.runnerUpProbability)}`;
  return `Model: ${percent(view.probability)} · else ${view.runnerUp} ${percent(view.runnerUpProbability)}`;
}

/** The shot as a noun for sentences: its type when the model is confident, else "shot". */
export function shotNoun(shot: Shot) {
  const view = shotTypeView(shot);
  return view?.confident ? view.label.toLowerCase() : "shot";
}

/** True when the analysis carries model shot types. */
export const hasShotTypes = (analysis: MatchAnalysis | undefined) => Boolean(analysis?.shotTypes);
