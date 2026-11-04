import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listLocalMatches, readLocalMatch } from "./local-match.ts";

test("local match loading is opt-in, validates manifests, and restricts match IDs", async () => {
  const previous = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  const directory = await mkdtemp(join(tmpdir(), "mintonix-match-"));
  try {
    delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
    assert.equal(await readLocalMatch("local"), null);
    process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
    for (const id of ["../local", "..", "/etc/passwd", "%2e%2e", "a/b", ""]) {
      assert.equal(await readLocalMatch(id), null);
    }
    assert.equal(await readLocalMatch("missing"), null);
    const match = join(directory, "local");
    await mkdir(match);
    const manifest = {
      version: 2, matchId: "local", title: "Local match", players: ["A", "B"],
      source: { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: 10 },
      rallies: [{ id: "one", game: 1, startSeconds: 1, endSeconds: 2 }],
    };
    await writeFile(join(match, "manifest.json"), JSON.stringify(manifest));
    const loaded = await readLocalMatch("local");
    assert.equal(loaded?.manifest.matchId, "local");
    assert.equal(loaded?.manifest.source.videoId, "AAAAAAAAAAA");
    await writeFile(join(match, "manifest.json"), JSON.stringify({ ...manifest, matchId: "other" }));
    await assert.rejects(readLocalMatch("local"), /match ID/);
    await writeFile(join(match, "manifest.json"), JSON.stringify({ ...manifest, rallies: [] }));
    await assert.rejects(readLocalMatch("local"), /at least one rally/);
  } finally {
    if (previous === undefined) delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
    else process.env.MINTONIX_LOCAL_MATCHES_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("the library lists all matches with valid manifests and excludes invalid entries", async () => {
  const previous = process.env.MINTONIX_LOCAL_MATCHES_DIR;
  const directory = await mkdtemp(join(tmpdir(), "mintonix-library-"));
  try {
    delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
    assert.deepEqual(await listLocalMatches(), []);
    process.env.MINTONIX_LOCAL_MATCHES_DIR = join(directory, "missing");
    assert.deepEqual(await listLocalMatches(), []);
    process.env.MINTONIX_LOCAL_MATCHES_DIR = directory;
    assert.deepEqual(await listLocalMatches(), []);

    for (const id of ["match-b", "match-a", "invalid", "v1-manifest", "wrong-id", "Invalid ID"]) {
      const match = join(directory, id);
      await mkdir(match);
      const manifest = id === "v1-manifest"
        ? { version: 1, matchId: id, title: `Match ${id}`, players: ["A", "B"], sourceDurationSeconds: 10,
          rallies: [{ id: "one", game: 1, startSeconds: 1, endSeconds: 2 }] }
        : { version: 2, matchId: id === "wrong-id" ? "other" : id, title: `Match ${id}`, players: ["A", "B"],
          source: { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: 10 },
          rallies: [{ id: "one", game: 1, startSeconds: 1, endSeconds: 2 }] };
      await writeFile(join(match, "manifest.json"), id === "invalid" ? "{}" : JSON.stringify(manifest));
    }
    await mkdir(join(directory, "unfinished"));
    await writeFile(join(directory, "notes.txt"), "Not a match");
    const matches = await listLocalMatches();
    assert.deepEqual(matches.map((match) => match.matchId), ["match-a", "match-b"]);
    assert.equal(matches[0].title, "Match match-a");
    process.env.MINTONIX_LOCAL_MATCHES_DIR = "relative/path";
    await assert.rejects(listLocalMatches(), /absolute path/);
  } finally {
    if (previous === undefined) delete process.env.MINTONIX_LOCAL_MATCHES_DIR;
    else process.env.MINTONIX_LOCAL_MATCHES_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
