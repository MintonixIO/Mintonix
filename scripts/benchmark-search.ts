/** Run from the repo root. With OPENROUTER_API_KEY set, the live probes consume
 * OpenRouter credits; this is never part of pnpm test/build.
 */
import { readLocalMatch, readLocalAnalysis } from "../components/rally-player/local-match.ts";
import { parseLocally, type SearchIntent } from "../components/rally-player/search/intent.ts";
import { buildSearchIndex, rankSearch } from "../components/rally-player/search/rank.ts";
import { DEFAULT_MODEL, interpretQuery } from "../components/rally-player/search/service.ts";

const match = await readLocalMatch("dl1");
if (!match) throw new Error("Benchmark requires the published dl1 match");
const index = buildSearchIndex(match, await readLocalAnalysis(match));
const cases: { query: string; expected: (i: SearchIntent) => boolean }[] = [
  { query: "An intense rally", expected: (i) => i.target === "rallies" && i.vibes.includes("intense") },
  { query: "Fast smashes by Viktor Axelsen over 200 km/h", expected: (i) => i.target === "shots" && i.player === "p0" && i.types.includes("smash") && i.minSpeed !== null && i.minSpeed >= 200 },
  { query: "A rally longer than 200 seconds", expected: (i) => i.target === "rallies" && i.minSeconds !== null && i.minSeconds >= 200 },
  { query: "Something exciting", expected: (i) => i.vibes.includes("exciting") },
  { query: "A long rally in game 3", expected: (i) => i.game === 3 && i.vibes.includes("long") },
  { query: "Jump smashes", expected: (i) => i.types.includes("smash") && i.unsupported.length > 0 },
  { query: "A smash followed by a lift", expected: (i) => i.sequence.join(",") === "smash,lift" },
  { query: "Shots by Lin Dan", expected: (i) => Boolean(i.player && !match.players.some((p) => p.id === i.player)) || i.unsupported.length > 0 },
];
const rows: { mode: string; query: string; ms: number; understood: boolean | null; ids: string[]; noExact: boolean }[] = [];
for (const item of cases) {
  const started = performance.now();
  const intent = parseLocally(item.query, match);
  const result = rankSearch(index, intent, "all", false);
  rows.push({ mode: "local", query: item.query, ms: performance.now() - started, understood: item.expected(intent), ids: result.results.slice(0, 3).map((r) => r.id), noExact: result.exactCount === 0 });
}
const apiKey = process.env.OPENROUTER_API_KEY;
if (apiKey) {
  for (const item of cases) {
    const started = performance.now();
    const intent = await interpretQuery(item.query, index, { apiKey, model: process.env.OPENROUTER_SEARCH_MODEL || DEFAULT_MODEL });
    const result = rankSearch(index, intent ?? parseLocally(item.query, match), "all", intent !== null);
    rows.push({ mode: intent ? "hybrid" : "fallback", query: item.query, ms: performance.now() - started, understood: intent ? item.expected(intent) : false, ids: result.results.slice(0, 3).map((r) => r.id), noExact: result.exactCount === 0 });
  }
}
console.log(JSON.stringify({ model: process.env.OPENROUTER_SEARCH_MODEL || DEFAULT_MODEL, rows: rows.map((r) => ({ ...r, ms: Math.round(r.ms * 100) / 100 })) }, null, 2));
// The timing distribution is a tiny smoke benchmark, never a production SLA.
for (const mode of [...new Set(rows.map((r) => r.mode))]) {
  const group = rows.filter((r) => r.mode === mode);
  const times = group.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${mode}: n=${times.length}, median=${times[Math.floor(times.length / 2)].toFixed(1)}ms, max=${times.at(-1)!.toFixed(1)}ms, intent checks=${group.filter((r) => r.understood).length}/${group.filter((r) => r.understood !== null).length}`);
}
