# Natural-language rally and shot search

Search sits directly under the video (between the video and the rally list on
a phone) and is scoped to that match. Users can ask
for an intense rally, fast smashes by a named player, a stroke sequence, or
numeric duration/speed/stroke-count bounds. Results include a small measured
flight diagram, stroke label and inference confidence, player, source timestamp,
score, duration/count, match percentage, and the criteria that matched or could
not be confirmed. A rally opens the existing video; a shot opens its 3D replay.
No broadcast frames or media are downloaded or re-hosted.

## Architecture

`POST /api/matches/:matchId/search` accepts `{query, target}` with a 2–400 character
query and optional `all | rallies | shots` target. The provider translates a
query into a validated intent schema. It sees only the query, schema and player
names/IDs, not the match catalog. The server scores real records from `match.json`
and optional `analysis.json`, then returns at most eight compact previews.

The default is `google/gemini-2.5-flash-lite`, overridable with
`OPENROUTER_SEARCH_MODEL`. It is an LLM used as a small intent classifier, not a
trained decision model. OpenRouter's [structured output](https://openrouter.ai/docs/guides/features/structured-outputs)
constrains JSON shape; [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
uses `sort: latency` and `require_parameters: true`. Shape validation cannot
guarantee the model understood every condition correctly.

No database, vector store, embedding calls, model training pipeline, or new
dependencies are needed. Each process caches parsed match indexes for 60 seconds
and up to 256 successful intents for five minutes. Index keys include the
configured match directory.
Local JSON changes appear after the index TTL or a process restart.

## Decision scorer and percentages

The current decision layer is deterministic, hand-tuned rules and weighted
features, not a learned classifier. Hard filters include game, winner, duration,
stroke count, hitter, type, exclusions, speed, and consecutive stroke sequence.
Hitter/type/speed requirements must all describe the same stroke. Racket strokes
retain their original indices, including when net continuations occur between
them. A winning shot means the final racket stroke by the rally winner; the
data cannot establish whether it was a clean winner.

Only `ok` measurements satisfy speed/height/net preferences. Low-confidence types
can contribute to nearby suggestions but cannot satisfy an exact type filter;
existing flight-based type corrections are preserved. Absence of analysis or
unknown measurements never becomes zero. Unknown players and unsupported
conditions prevent an exact-match claim. Exact score, jump/backhand/forehand,
deception, diving, placement and complex Boolean requests are explicitly
unsupported in this initial schema, even when part of the phrase is searchable.

Subjective preferences are disclosed in the UI:

| Term | Signals |
| --- | --- |
| Exciting | 30% length, 25% speed, 25% attacking strokes, 20% late close score |
| Intense | 40% length, 30% exchange pace, 20% attacking strokes, 10% late close score |
| Long / short | Playing duration, excluding cuts and replays |
| Fast / high / tight to net | Reliable launch speed / apex / net clearance |
| Clutch | Score proximity and how late the game is |

Length and speed have smooth increasing scales (`seconds / (seconds + 15)` and
`kmh / (kmh + 90)`) so extreme candidates retain their ordering. Preferences
average when combined. A preference score of at least 0.55 is a strong fit.
Hard-filter satisfaction forms the base score; preferences receive 35% weight
when combined with filters. Failed criteria cap relevance at 79%, local-only
suggestions at 74%, and subjective scores at 99%. These are inspectable product
heuristics, **not calibrated probabilities or proof of objective excitement**.

All filters must pass to claim a fit, independently of the percentage. Subjective
searches never claim exactness. When none fit, the response explicitly says so,
returns nearby candidates, and lists unmet conditions. Results are diversified
to avoid filling the list with a single rally. Query interpretation can still
miss a subtle requirement; the preview evidence lets the user inspect the result.

## Latency, failure handling and limits

The model request, including body parsing, has a 2.2-second deadline and no retry.
Missing keys, timeouts, refusals, provider errors and invalid JSON return local
keyword suggestions with an explicit reduced-understanding notice. A failed call
affects only its own search. The client cancels superseded searches,
discards stale responses, and gives up after eight seconds including cold starts.
The deadline bounds inference, not network transit or a server cold start.

The public endpoint validates IDs/body shape, limits the body to 4 KiB, rejects
cross-origin browser requests (the `Origin` host must equal the `Host` or
`X-Forwarded-Host` header), and returns only generic errors. Each process allows
30 new provider calls per minute; excess traffic falls back locally. This limit
is deliberately in memory and is not global across server instances. Configure OpenRouter account spend limits for deployment.
Credentials live in ignored `.env.local` or server environment variables.

## Decision models versus direct LLM retrieval

| Approach | Tradeoff | Decision |
| --- | --- | --- |
| Local keyword parser + rule scorer | A few milliseconds, transparent, weaker paraphrases/sequences | Outage fallback |
| Small LLM intent parser + rule scorer | One small call; IDs, constraints and evidence remain local | Implemented default |
| LLM selects IDs from the full catalog | Much larger input, can duplicate IDs or miss numeric constraints | Rejected after a one-off probe |
| Trained tree/boosted-tree relevance model | Potentially fast personalized ranking, needs labelled relevance examples and validation | Defer until labels exist |
| Embedding similarity | Useful for descriptive text; current records are structured numbers/types and hard filters still need code | Unnecessary for this catalog |

A trained decision model could replace the preference weights later, using
duration, pace, attack count, speed, score pressure and explicit relevance labels.
Evaluate it with held-out matches and human-labelled query/result pairs, then
calibrate scores separately. Training on this scorer's own outputs would only
copy its assumptions. There is currently no relevance-label dataset, so this
implementation does not claim a trained decision model or human-validated ranking.

## Reproduce the comparison

```sh
# Local parser and scorer only; no paid API calls:
node --conditions=react-server scripts/benchmark-search.ts
# Adds eight live intent probes:
node --conditions=react-server --env-file=.env.local scripts/benchmark-search.ts
```

The benchmark is opt-in, uses the configured key, and is excluded from tests and
builds. It prints timings, sampled IDs, intent checks and no-exact status, never
the key. The full-catalog retrieval row below came from a one-off probe that sent
compact published match facts to OpenRouter; it is no longer part of the script,
and ordinary search never sends match facts.

A local smoke run on November 10, 2026, on the published 108-rally match (1,078
racket strokes; 1,186 candidates) measured:

| Path | Requests | Median | Maximum |
| --- | --- | --- | --- |
| Local parser + scorer | 8 | 1.9 ms | 4.2 ms |
| Successful hybrid | 7 | 742 ms | 892 ms |
| Hybrid timeout + local fallback | 1 | 2,208 ms | 2,208 ms |
| Direct full-catalog LLM retrieval | 3 | 993 ms | 1,204 ms |

The seven completed hybrid interpretations passed their expected intent checks;
one timed out. The initial local parser passed five of eight; its numeric phrasing
and unknown-name handling were subsequently improved. Direct retrieval used a
99,814-byte catalog, returned a duplicate ID for the smash query, and set
`noExact: false` for “A rally longer than 200 seconds” despite no such rally.
This is a small smoke comparison, not a quality evaluation or production p95/SLA.
It supports retaining local enforcement even when direct LLM retrieval is fast.
