import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hasLocalAnalysis, listLocalMatches, readLocalAnalysis, readLocalMatch } from "./local-match.ts";
import { analysisFixture, matchFixture } from "./test-fixtures.ts";

async function withMatchesDirectory(run: (directory: string) => Promise<void>) {
  const previous = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  const directory = await mkdtemp(join(tmpdir(), "mintonix-match-"));
  try {
    await run(directory);
  } finally {
    if (previous === undefined) delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
    else process.env.MINTONIX_LOCAL_MATCHES_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeMatch(directory: string, folder: string, match: unknown, analysis?: unknown) {
  await mkdir(join(directory, folder), { recursive: true });
  await writeFile(join(directory, folder, "match.json"), typeof match === "string" ? match : JSON.stringify(match));
  if (analysis !== undefined) await writeFile(join(directory, folder, "analysis.json"), JSON.stringify(analysis));
}

test("match loading validates match files and restricts match IDs", () => withMatchesDirectory(async (directory) => {
  delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
  assert.equal(await readLocalMatch("illustrative-match"), null);
  process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
  for (const id of ["../local", "..", "/etc/passwd", "%2e%2e", "a/b", ""]) assert.equal(await readLocalMatch(id), null);
  assert.equal(await readLocalMatch("missing"), null);
  await writeMatch(directory, "illustrative-match", matchFixture());
  const match = await readLocalMatch("illustrative-match");
  assert.equal(match?.source.videoId, "AAAAAAAAAAA");
  assert.equal(await readLocalAnalysis(match!), null);
  await writeMatch(directory, "illustrative-match", { ...matchFixture(), matchId: "other" });
  await assert.rejects(readLocalMatch("illustrative-match"), /match ID/);
  await writeMatch(directory, "illustrative-match", { ...matchFixture(), rallies: [] });
  await assert.rejects(readLocalMatch("illustrative-match"), /Invalid match/);
}));

test("analysis is optional and validated against its match", () => withMatchesDirectory(async (directory) => {
  process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
  await writeMatch(directory, "illustrative-match", matchFixture(), analysisFixture());
  const match = (await readLocalMatch("illustrative-match"))!;
  assert.equal((await readLocalAnalysis(match))?.rallies.r1.shots.length, 2);
  await writeMatch(directory, "illustrative-match", matchFixture(), { ...analysisFixture(), matchId: "other" });
  await assert.rejects(readLocalAnalysis(match), /Invalid analysis/);
}));

test("the library lists all valid matches and excludes invalid entries", () => withMatchesDirectory(async (directory) => {
  process.env.MINTONIX_LOCAL_MATCHES_DIR = join(directory, "missing");
  assert.deepEqual(await listLocalMatches(), []);
  process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
  assert.deepEqual(await listLocalMatches(), []);
  for (const id of ["match-b", "match-a", "wrong-id", "Invalid ID"]) {
    await writeMatch(directory, id, { ...matchFixture(), matchId: id === "wrong-id" ? "other" : id, title: `Match ${id}` });
  }
  await writeMatch(directory, "invalid", "{}");
  await writeMatch(directory, "v2-manifest", { ...matchFixture(), matchId: "v2-manifest", version: 2 });
  await mkdir(join(directory, "unfinished"));
  await writeFile(join(directory, "notes.txt"), "Not a match");
  const matches = await listLocalMatches();
  assert.deepEqual(matches.map((match) => match.matchId), ["match-a", "match-b"]);
  assert.equal(matches[0].title, "Match match-a");
  process.env.MINTONIX_LOCAL_MATCHES_DIR = "relative/path";
  await assert.rejects(listLocalMatches(), /absolute path/);
}));

test("without a configured directory, the published matches in content/matches load and validate", () => withMatchesDirectory(async () => {
  delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
  const matches = await listLocalMatches();
  assert.ok(matches.some((match) => match.matchId === "dl1"));
  for (const match of matches) {
    assert.equal((await readLocalMatch(match.matchId))?.matchId, match.matchId);
    if (await hasLocalAnalysis(match)) assert.equal((await readLocalAnalysis(match))?.matchId, match.matchId);
  }
  assert.equal(await hasLocalAnalysis(matches.find((match) => match.matchId === "dl1")!), true);
}));
