/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate fixtures into arbitrary invalid shapes */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parseAnalysis, parseMatch } from "./contract.ts";
import { contractFiles } from "./contract-files.ts";
import { analysisFixture, matchFixture } from "./test-fixtures.ts";

test("a valid match parses, with optional scores, servers and winners", () => {
  const match = parseMatch(matchFixture());
  assert.equal(match.rallies.length, 3);
  assert.deepEqual(match.rallies[0].segments, [[34, 40], [42, 48]]);
  assert.equal(match.rallies[2].scoreBefore, undefined);
});

test("invalid matches are rejected", () => {
  const mutations: ((input: Record<string, any>) => void)[] = [
    (m) => { m.version = 2; },
    (m) => { m.unexpected = true; },
    (m) => { m.rallies[0].unexpected = true; },
    (m) => { m.players = [m.players[0]]; },
    (m) => { m.players[1].id = "a"; },
    (m) => { m.players[0].id = "Not An Id"; },
    (m) => { m.review = "maybe"; },
    (m) => { m.rallies = []; },
    (m) => { m.rallies[0].segments = []; },
    (m) => { m.rallies[0].segments[0] = [40, 34]; },                 // end before start
    (m) => { m.rallies[0].segments[1] = [39, 48]; },                 // overlaps the previous segment
    (m) => { m.rallies[1].segments[0] = [47, 89]; },                 // overlaps the previous rally
    (m) => { m.rallies[2].segments[0] = [112, 1000]; },              // beyond the source
    (m) => { m.rallies[1].id = "r1"; },
    (m) => { m.rallies[1].game = 0; },
    (m) => { m.rallies[0].game = 2; },                               // game moves backward at r2
    (m) => { m.rallies[0].scoreBefore = { a: 0.5, b: 0 }; },
    (m) => { m.rallies[0].scoreBefore = { a: 0, c: 0 }; },
    (m) => { m.rallies[0].scoreBefore = { a: 0 }; },
    (m) => { m.rallies[0].winner = "c"; },
    (m) => { m.source.provider = "vimeo"; },
    (m) => { m.source.videoId = "https://youtu.be/AAAAAAAAAAA"; },
    (m) => { m.source.durationSeconds = Number.NaN; },
    (m) => { m.source.url = "x"; },
  ];
  for (const mutate of mutations) {
    const input = matchFixture();
    mutate(input);
    assert.throws(() => parseMatch(input), /Invalid match/, String(mutate));
  }
});

test("analysis must reference the match's rallies and players, with shots inside their rally", () => {
  const match = parseMatch(matchFixture());
  assert.equal(parseAnalysis(analysisFixture(), match).rallies.r1.shots.length, 2);
  const mutations: ((input: Record<string, any>) => void)[] = [
    (a) => { a.matchId = "other"; },
    (a) => { a.rallies.r9 = { shots: [] }; },
    (a) => { a.players.c = a.players.a; },
    (a) => { a.rallies.r1.shots[0].hitter = "c"; },
    (a) => { a.rallies.r1.shots[0].startSeconds = 10; },
    (a) => { a.rallies.r1.shots[1].endSeconds = 60; },
    (a) => { a.rallies.r1.shots.reverse(); },
    (a) => { a.rallies.r1.shots[0].quality = "great"; },
    (a) => { a.rallies.r1.shots[0].path = [[34.5, 3, 2]]; },
  ];
  for (const mutate of mutations) {
    const input = analysisFixture();
    mutate(input);
    assert.throws(() => parseAnalysis(input, match), /Invalid analysis/, String(mutate));
  }
});

test("contracts/ matches the schemas in contract.ts (run pnpm contracts after changing them)", async () => {
  for (const [name, text] of Object.entries(contractFiles())) {
    assert.equal(await readFile(join(import.meta.dirname, "../../../../contracts", name), "utf8"), text, name);
  }
});