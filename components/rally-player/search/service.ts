import "server-only";

import { z } from "zod";
import { readLocalAnalysis, readLocalMatch } from "../local-match.ts";
import { intentPrompt, intentSchema, parseLocally, TARGETS, type SearchIntent, type SearchTarget } from "./intent.ts";
import { buildSearchIndex, rankSearch, type SearchIndex, type SearchResponse } from "./rank.ts";

export const LANGUAGE_TIMEOUT_MS = 2200;
export const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const MAX_BODY_BYTES = 4096;
const requestSchema = z.object({ query: z.string().trim().min(2).max(400), target: z.enum(TARGETS).default("all"), instant: z.boolean().default(false) }).strict();
const outputSchema = z.toJSONSchema(intentSchema, { target: "draft-7" });
const indexes = new Map<string, { expires: number; promise: Promise<SearchIndex | null> }>();
const intents = new Map<string, { expires: number; intent: SearchIntent }>();
let windowStart = 0;
let requestsInWindow = 0;

/** Parsed matches are reused for a minute. Misses are not kept, so only real matches occupy the cache. */
async function getIndex(matchId: string) {
  const key = `${process.env.MINTONIX_LOCAL_MATCHES_DIR ?? "published"}:${matchId}`;
  const existing = indexes.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    const match = await readLocalMatch(matchId);
    return match ? buildSearchIndex(match, await readLocalAnalysis(match)) : null;
  })();
  indexes.set(key, { expires: Date.now() + 60_000, promise });
  const index = await promise.catch(() => null);
  if (!index) indexes.delete(key);
  return promise;
}

/** Only the query and player names leave the server, never trajectories or credentials. */
export async function interpretQuery(query: string, index: SearchIndex, options: {
  apiKey: string; model?: string; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<SearchIntent | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, options.timeoutMs ?? LANGUAGE_TIMEOUT_MS);
  });
  const request = (async () => {
    try {
      const response = await (options.fetcher ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: controller.signal, cache: "no-store",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Mintonix rally search" },
        body: JSON.stringify({
          model: options.model ?? DEFAULT_MODEL, temperature: 0, max_tokens: 600,
          provider: { sort: "latency", require_parameters: true },
          messages: [{ role: "system", content: intentPrompt(index.match) }, { role: "user", content: query }],
          response_format: { type: "json_schema", json_schema: { name: "rally_search", strict: true, schema: outputSchema } },
        }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length > 8000) return null;
      const parsed = intentSchema.safeParse(JSON.parse(content));
      return parsed.success ? parsed.data : null;
    } catch { return null; }
  })();
  try { return await Promise.race([request, timeout]); }
  finally { clearTimeout(timer); }
}

async function languageIntent(query: string, index: SearchIndex) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_SEARCH_MODEL || DEFAULT_MODEL;
  const key = JSON.stringify([model, index.match.players, query.toLowerCase()]);
  const cached = intents.get(key);
  if (cached && cached.expires > Date.now()) return cached.intent;
  // A per-process budget for a public, account-free feature. It is not global across
  // server instances, so deployments also need a provider spend cap.
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); requestsInWindow = 0; }
  if (requestsInWindow >= 30) return null;
  requestsInWindow++;
  const intent = await interpretQuery(query, index, { apiKey, model });
  if (intent) {
    if (intents.size >= 256) intents.delete(intents.keys().next().value!);
    intents.set(key, { expires: Date.now() + 5 * 60_000, intent });
  }
  return intent;
}

/** `instant` is search-as-you-type: keyword parsing only, so a half-typed query never spends a language request. */
export async function searchMatch(matchId: string, query: string, target: SearchTarget, instant = false): Promise<SearchResponse | null> {
  const index = await getIndex(matchId);
  if (!index) return null;
  const interpreted = instant ? null : await languageIntent(query, index);
  const intent = interpreted ?? parseLocally(query, index.match);
  return { ...rankSearch(index, intent, target, interpreted !== null), mode: interpreted ? "language" : "local" };
}

export async function handleSearchRequest(request: Request, matchId: string): Promise<Response> {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(matchId)) return json({ error: "Match not found." }, 404);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON search request." }, 415);
  // Reject cross-origin browser calls to the paid endpoint. Compare with the Host
  // header: behind a proxy or on a LAN address, request.url is not the public origin.
  // Requests without an Origin are allowed; this is not authentication or a quota.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== host)) return json({ error: "Search from this site." }, 403);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "Search request is too long." }, 413);
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Search request is too long." }, 413);
    input = JSON.parse(text);
  } catch { return json({ error: "Invalid search request." }, 400); }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Use 2–400 characters and choose rallies, shots, or both." }, 400);
  try {
    const result = await searchMatch(matchId, parsed.data.query, parsed.data.target, parsed.data.instant);
    return result ? json(result) : json({ error: "Match not found." }, 404);
  } catch { return json({ error: "This match could not be searched. Please try again." }, 503); }
}
