import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAnalysis, parseMatch } from "../contract.ts";
import { matchFixture, typedAnalysisFixture } from "../test-fixtures.ts";
import { emptyIntent, parseLocally } from "./intent.ts";
import { buildSearchIndex, rankSearch } from "./rank.ts";
import { handleSearchRequest, interpretQuery } from "./service.ts";

function fixture() {
  const match = parseMatch(matchFixture());
  const input = typedAnalysisFixture();
  input.rallies.r1.shots[1].shotType.probability = 0.9;
  const analysis = parseAnalysis(input, match);
  return { match, analysis, index: buildSearchIndex(match, analysis) };
}

test("shot results preserve source indices and include grounded previews and labels", () => {
  const { index } = fixture();
  const result = rankSearch(index, { ...emptyIntent(), types: ["lift"], target: "shots" });
  assert.equal(result.exactCount, 1);
  const hit = result.results[0];
  assert.equal(hit.rallyId, "r1");
  assert.equal(hit.shotIndex, 1);
  assert.equal(hit.title, "Lift");
  assert.equal(hit.player, "Player B");
  assert.equal(hit.speedKmh, 72);
  assert.equal(hit.matchPercent, 100);
  assert.ok(hit.paths[0].length > 1);
});

test("rally playing duration excludes cuts and replays", () => {
  const { index } = fixture();
  const result = rankSearch(index, { ...emptyIntent(), target: "rallies", minSeconds: 13 });
  assert.deepEqual(result.results.map((r) => r.rallyId), ["r2"]);
});

test("hitter, stroke type and speed must be on the same shot", () => {
  const { index } = fixture();
  const result = rankSearch(index, { ...emptyIntent(), target: "rallies", types: ["lift"], player: "a" });
  assert.equal(result.exactCount, 0);
  assert.ok(result.results.every((r) => !r.fits && r.matchPercent < 80));
  assert.ok(result.results[0].missing.length > 0);
});

test("impossible requirements return explicit alternatives, never exact matches", () => {
  const { index } = fixture();
  const result = rankSearch(index, { ...emptyIntent(), minSeconds: 900, target: "rallies" });
  assert.match(result.message, /No exact/);
  assert.ok(result.results.length > 0);
  assert.ok(result.results.every((r) => r.matchPercent < 80 && !r.fits));
});

test("uncertain shot types cannot satisfy exact filters", () => {
  const match = parseMatch(matchFixture());
  const index = buildSearchIndex(match, parseAnalysis(typedAnalysisFixture(), match));
  const result = rankSearch(index, { ...emptyIntent(), types: ["lift"], target: "shots" });
  assert.equal(result.exactCount, 0);
  assert.equal(result.results[0].typeUncertain, true);
  assert.match(result.results[0].title, /uncertain/);
});

test("unreliable or guessed speeds never satisfy numeric filters or show as measured", () => {
  const { match, analysis } = fixture();
  analysis.rallies.r1.shots[1].quality = "unreliable";
  analysis.rallies.r1.shots[1].speed = 300;
  const result = rankSearch(buildSearchIndex(match, analysis), { ...emptyIntent(), minSpeed: 500, target: "shots" });
  assert.equal(result.exactCount, 0);
  const hit = result.results.find((r) => r.shotIndex === 1)!;
  assert.equal(hit.speedKmh, null);
  assert.deepEqual(hit.paths, []);
});

test("sequences preserve order and shot matches must participate in the sequence", () => {
  const { index } = fixture();
  const intent = { ...emptyIntent(), sequence: ["short_serve", "lift"] as const };
  assert.equal(rankSearch(index, { ...intent, sequence: [...intent.sequence] }, "shots").exactCount, 2);
  assert.equal(rankSearch(index, { ...intent, sequence: ["lift", "short_serve"] }).exactCount, 0);
});

test("a matching type elsewhere in the rally cannot satisfy a requested sequence", () => {
  const { match, analysis } = fixture();
  const other = structuredClone(analysis.rallies.r1.shots[0]);
  other.startSeconds = 37; other.endSeconds = 38;
  other.shotType!.name = "smash";
  analysis.rallies.r1.shots.push(other);
  const result = rankSearch(buildSearchIndex(match, analysis), { ...emptyIntent(),
    sequence: ["short_serve", "lift"], types: ["smash"], target: "rallies" });
  assert.equal(result.exactCount, 0);
});

test("rally winners and final shots are distinct from any shot in a won rally", () => {
  const { index } = fixture();
  const result = rankSearch(index, { ...emptyIntent(), winningShot: true, target: "shots" });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].shotIndex, 1);
});

test("unsupported conditions and unknown players cannot be silently dropped", () => {
  const { index } = fixture();
  assert.equal(rankSearch(index, { ...emptyIntent(), unsupported: ["jump smash"] }).exactCount, 0);
  assert.equal(rankSearch(index, { ...emptyIntent(), player: "Someone Else" }).exactCount, 0);
});

test("missing analysis is not zero shots or zero speed", () => {
  const { match } = fixture();
  const index = buildSearchIndex(match, null);
  const result = rankSearch(index, { ...emptyIntent(), maxShots: 2, target: "rallies" });
  assert.equal(result.exactCount, 0);
  assert.ok(result.notices.some((n) => n.includes("no shot analysis")));
  assert.equal(rankSearch(index, emptyIntent(), "shots").results.length, 0);
  assert.equal(rankSearch(index, { ...emptyIntent(), minSeconds: 5 }, "rallies").results.length, 3);
});

test("vague queries are deterministic and disclose their interpretation", () => {
  const { index, match } = fixture();
  const intent = parseLocally("An exciting and intense rally", match);
  assert.deepEqual(intent.vibes, ["exciting", "intense"]);
  const result = rankSearch(index, intent);
  assert.equal(result.exactCount, 0);
  assert.equal(result.interpretation.length, 2);
  assert.deepEqual(result, rankSearch(index, intent));
});

test("fastest and longest preferences keep ordering above common speed and duration ceilings", () => {
  const { match, analysis } = fixture();
  analysis.rallies.r1.shots[0].speed = 80;
  analysis.rallies.r1.shots[1].speed = 90;
  const result = rankSearch(buildSearchIndex(match, analysis), { ...emptyIntent(), vibes: ["fast"], target: "shots" });
  assert.equal(result.results[0].shotIndex, 1);
  assert.ok(result.results[0].matchPercent < 100);
});

test("a fast opponent cannot inflate the score of a slower requested player's shot", () => {
  const { match, analysis } = fixture();
  analysis.rallies.r1.shots[0].speed = 8;
  analysis.rallies.r1.shots[1].speed = 90;
  const index = buildSearchIndex(match, analysis);
  const result = rankSearch(index, { ...emptyIntent(), player: "a", vibes: ["fast"], target: "rallies" });
  assert.equal(result.results[0].fits, false);
});

test("local fallback extracts common filters but never claims fully understood requirements", () => {
  const { index, match } = fixture();
  const intent = parseLocally("smashes over 200 km/h in game 2", match);
  assert.deepEqual(intent.types, ["smash"]);
  assert.equal(intent.minSpeed, 200);
  assert.equal(intent.game, 2);
  assert.equal(parseLocally("long serves", match).vibes.length, 0);
  const result = rankSearch(index, { ...emptyIntent(), minSeconds: 1 }, "rallies", false);
  assert.equal(result.exactCount, 0);
  assert.ok(result.results.every((r) => !r.fits));
  assert.ok(result.notices.some((n) => n.includes("approximate keyword")));
});

test("language parser validates structured output and sends no rally data", async () => {
  const { index } = fixture();
  const expected = { ...emptyIntent(), types: ["smash"], target: "shots" };
  let sent: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    sent = JSON.parse(init?.body as string);
    assert.ok(!JSON.stringify(sent).includes("startSeconds"));
    assert.ok(!JSON.stringify(sent).includes("test-key"));
    return Response.json({ choices: [{ message: { content: JSON.stringify(expected) } }] });
  };
  assert.deepEqual(await interpretQuery("smashes", index, { apiKey: "test-key", fetcher }), expected);
  assert.deepEqual(sent?.provider, { sort: "latency", require_parameters: true });
});

test("language failures, malformed output, refusal and stalled responses fall back within deadline", async () => {
  const { index } = fixture();
  for (const response of [new Response("no", { status: 429 }), Response.json({ error: "no" }), Response.json({ choices: [{ message: { content: '{"invented":"id"}' } }] })]) {
    assert.equal(await interpretQuery("test", index, { apiKey: "key", fetcher: async () => response }), null);
  }
  let signal: AbortSignal | null | undefined;
  const started = performance.now();
  assert.equal(await interpretQuery("test", index, { apiKey: "key", timeoutMs: 20, fetcher: async (_url, init) => {
    signal = init?.signal;
    return new Promise(() => {});
  } }), null);
  assert.ok(signal?.aborted);
  assert.ok(performance.now() - started < 500);
});

test("a player named by the model resolves to that player; unknown and ambiguous names do not", () => {
  const { match, analysis } = fixture();
  match.players[0].name = "Viktor Axelsen";
  match.players[1].name = "Shi Yu Qi";
  const index = buildSearchIndex(match, analysis);
  for (const player of ["b", "Shi Yu Qi", "shi"]) {
    const result = rankSearch(index, { ...emptyIntent(), types: ["lift"], player, target: "shots" });
    assert.equal(result.exactCount, 1);
    assert.deepEqual(result.results[0].reasons, ["lift (inferred)", "Hit by Shi Yu Qi"]);
  }
  assert.equal(rankSearch(index, { ...emptyIntent(), types: ["lift"], player: "Lin Dan", target: "shots" }).exactCount, 0);
  assert.equal(rankSearch(fixture().index, { ...emptyIntent(), types: ["lift"], player: "Player", target: "shots" }).exactCount, 0);
});

test("local fallback separates hitter from rally winner and ignores words inside names", () => {
  const match = parseMatch({ ...matchFixture(), players: [{ id: "a", name: "Viktor Axelsen" }, { id: "b", name: "Shi Yu Qi" }] });
  const both = parseLocally("Axelsen smashes in rallies Shi Yu Qi won", match);
  assert.equal(both.player, "a");
  assert.equal(both.winner, "b");
  assert.equal(parseLocally("rallies won by Viktor", match).winner, "a");
  assert.equal(parseLocally("smashes by Shi", match).winner, null);
  const clear = parseLocally("a clear winner", match);
  assert.deepEqual(clear.types, []);
  assert.equal(clear.winningShot, true);
  const named = parseMatch({ ...matchFixture(), players: [{ id: "a", name: "Patrick Wright" }, { id: "b", name: "Player B" }] });
  assert.deepEqual(parseLocally("smashes by Patrick Wright", named).unsupported, []);
  assert.deepEqual(parseLocally("the quickest smashes", named).vibes, ["fast"]);
  assert.equal(parseLocally("backhand smashes", named).unsupported.length, 1);
});

const request = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/matches/example/search", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const MATCH = "illustrative-match";

/** Serve the synthetic fixture from a temporary matches directory, without a provider key. */
async function withFixtureMatch(run: () => Promise<void>) {
  const previous = { dir: process.env.MINTONIX_LOCAL_MATCHES_DIR, key: process.env.OPENROUTER_API_KEY };
  const directory = await mkdtemp(join(tmpdir(), "mintonix-search-"));
  await mkdir(join(directory, MATCH));
  await writeFile(join(directory, MATCH, "match.json"), JSON.stringify(matchFixture()));
  await writeFile(join(directory, MATCH, "analysis.json"), JSON.stringify(typedAnalysisFixture()));
  process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
  delete process.env.OPENROUTER_API_KEY;
  try { await run(); } finally {
    if (previous.dir === undefined) delete process.env.MINTONIX_LOCAL_MATCHES_DIR; else process.env.MINTONIX_LOCAL_MATCHES_DIR = previous.dir;
    if (previous.key !== undefined) process.env.OPENROUTER_API_KEY = previous.key;
    await rm(directory, { recursive: true, force: true });
  }
}

test("API rejects empty, oversized, invalid and cross-origin input before provider access", () => withFixtureMatch(async () => {
  for (const body of [{ query: " " }, { query: "a" }, { query: "x".repeat(401) }, { query: "smashes", target: "everything" }]) {
    assert.equal((await handleSearchRequest(request(body), MATCH)).status, 400);
  }
  assert.equal((await handleSearchRequest(request({ query: "x".repeat(5000) }), MATCH)).status, 413);
  assert.equal((await handleSearchRequest(request({ query: "smash" }), "../secrets")).status, 404);
  assert.equal((await handleSearchRequest(request({ query: "smash" }, { origin: "https://other.example" }), MATCH)).status, 403);
  assert.equal((await handleSearchRequest(request({ query: "smash" }, { origin: "not a url" }), MATCH)).status, 403);
  const malformed = new Request("http://localhost/search", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
  assert.equal((await handleSearchRequest(malformed, MATCH)).status, 400);
}));

test("the same-origin check follows the Host header, not the server's bound address", () => withFixtureMatch(async () => {
  // A phone on the LAN or a reverse proxy: the browser's origin differs from request.url.
  const lan = { origin: "http://192.168.1.20:3000", host: "192.168.1.20:3000" };
  assert.equal((await handleSearchRequest(request({ query: "smash" }, lan), MATCH)).status, 200);
  const proxied = { origin: "https://mintonix.example", host: "internal:3000", "x-forwarded-host": "mintonix.example" };
  assert.equal((await handleSearchRequest(request({ query: "smash" }, proxied), MATCH)).status, 200);
  assert.equal((await handleSearchRequest(request({ query: "smash" }, { ...lan, origin: "https://other.example" }), MATCH)).status, 403);
}));

test("API searches a match without a key and reports unavailable matches", () => withFixtureMatch(async () => {
  const response = await handleSearchRequest(request({ query: "intense rally" }), MATCH);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "local");
  assert.ok(body.results.length > 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await handleSearchRequest(request({ query: "smash" }), "missing-match")).status, 404);
}));

test("search-as-you-type never spends a language request, even with a key", () => withFixtureMatch(async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}", { status: 500 }); }) as typeof fetch;
  try {
    const response = await handleSearchRequest(request({ query: "fast smashes", instant: true }), MATCH);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, "local");
    assert.equal(calls, 0);
    assert.equal((await handleSearchRequest(request({ query: "smash", instant: "yes" }), MATCH)).status, 400);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_API_KEY;
  }
}));
