import type { ReplyTally, ShotTypeName } from "../contract.ts";
import { SHOT_TYPE_NAMES } from "./shot-types.ts";

// The counts behind these sentences are computed by the engine (analysis.patterns and
// players[p].shotTypes); this module only words them.

/** Fewer reliably measured shots of a type than this and the comparison falls back to all shots. */
export const MIN_TYPE_SAMPLE = 5;
/** Fewer occurrences than this and a pattern isn't stated. */
export const MIN_PATTERN_SAMPLE = 8;

/** "a lift", "smashes": the forms sentences need. */
export const withArticle = (name: ShotTypeName) => `a ${SHOT_TYPE_NAMES[name].label.toLowerCase()}`;
export function plural(name: ShotTypeName) {
  const word = SHOT_TYPE_NAMES[name].label.toLowerCase();
  return /(sh|ch|s)$/.test(word) ? `${word}es` : `${word}s`;
}

/** "usually answers with a lift (62%, 70 of 113)"; null when the sample is too small to call a tendency. */
export function tendency(result: ReplyTally | undefined, verb: string) {
  const top = result?.replies[0];
  if (!result || !top || result.n < MIN_PATTERN_SAMPLE) return null;
  const share = top.count / result.n;
  const adverb = share >= 0.5 ? "usually" : "most often";
  return `${adverb} ${verb} ${withArticle(top.type)} (${Math.round(share * 100)}%, ${top.count} of ${result.n})`;
}
