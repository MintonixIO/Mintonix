/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate fixtures into arbitrary invalid shapes */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parseAnalysis, parseMatch, parseMetadata, parseRallyMotion } from "./contract.ts";
import { contractFiles } from "./contract-files.ts";
import { analysisFixture, matchFixture, metadataFixture, rallyMotionFixture, typedAnalysisFixture } from "./test-fixtures.ts";

test("a valid match parses, with optional scores, servers and winners", () => {
  const match = parseMatch(matchFixture());
  assert.equal(match.rallies.length, 3);
  assert.deepEqual(match.rallies[0].segments, [[34, 40], [42, 48]]);
  assert.equal(match.rallies[2].scoreBefore, undefined);
});

test("invalid matches are rejected", () => {
  const mutations: ((input: Record<string, any>) => void)[] = [
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
    (m) => { m.source.fps = 0; },
    (m) => { m.rallies[2].id = "metadata"; },                       // would collide with metadata.json
    (m) => { m.poses = { model: "MotionBERT", players: { c: { heightMetres: 1.6, heightSource: "default" } } }; },
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

test("shot types are optional, racket-only and need their model named", () => {
  const match = parseMatch(matchFixture());
  assert.equal(parseAnalysis(typedAnalysisFixture(), match).rallies.r1.shots[0].shotType?.name, "short_serve");
  const unknown = typedAnalysisFixture();
  unknown.rallies.r1.shots[1].shotType.name = null;
  assert.equal(parseAnalysis(unknown, match).rallies.r1.shots[1].shotType?.name, null);
  const mutations: ((input: Record<string, any>) => void)[] = [
    (a) => { delete a.shotTypes; },
    (a) => { a.rallies.r1.shots[0].shotType.name = "lob"; },
    (a) => { a.rallies.r1.shots[0].shotType.probability = 1.2; },
    (a) => { a.rallies.r1.shots[0].startContact = "net"; a.rallies.r1.shots[0].hitter = null; },
    (a) => { a.shotTypes.source = "not a url"; },
    (a) => { a.rallies.r1.shots[0].shotType.correction = { from: "push", fromProbability: 0.5, reason: "guess" }; },
  ];
  for (const mutate of mutations) {
    const input = typedAnalysisFixture();
    mutate(input);
    assert.throws(() => parseAnalysis(input, match), /Invalid analysis/, String(mutate));
  }
});

test("metadata splits into the match and its shot data", () => {
  const typed = typedAnalysisFixture();
  const { match, analysis } = parseMetadata(metadataFixture(matchFixture(), typed));
  assert.deepEqual(match, parseMatch(matchFixture()));
  assert.deepEqual(analysis, parseAnalysis(typed, match));
  const bare = parseMetadata(metadataFixture(matchFixture(), null));
  assert.equal(bare.analysis, null);
  assert.equal(bare.match.rallies.length, 3);
});

test("invalid metadata is rejected", () => {
  const mutations: ((input: Record<string, any>) => void)[] = [
    (m) => { m.version = 2; },
    (m) => { delete m.rallies[0].summary; },                         // shots without their summary
    (m) => { delete m.analysis; },                                   // rally shots without the match analysis
    (m) => { m.rallies[0].shots[0].hitter = "c"; },                  // the analysis rules still apply
    (m) => { m.rallies[1].segments[0] = [47, 89]; },                 // and the match rules
    (m) => { m.analysis.rallies = {}; },
  ];
  for (const mutate of mutations) {
    const input = metadataFixture();
    mutate(input);
    assert.throws(() => parseMetadata(input), /Invalid (metadata|match|analysis)/, String(mutate));
  }
});

test("rally files must match their rally, players and frame rate", () => {
  const match = parseMatch(matchFixture());
  assert.equal(parseRallyMotion(rallyMotionFixture(), match).poses.b.length, 2);
  const mutations: ((input: Record<string, any>) => void)[] = [
    (r) => { r.version = 2; },
    (r) => { r.matchId = "other"; },
    (r) => { r.rallyId = "r9"; },
    (r) => { r.fps = 25; },
    (r) => { r.poses.c = r.poses.a; },
    (r) => { r.distance.c = 1; },
    (r) => { r.distance.a = -1; },
    (r) => { r.poses.a[0].root.pop(); },                             // sizes must match the frame count
    (r) => { r.poses.a[0].joints.push(0); },
    (r) => { r.poses.a[0].root[0] = 1.5; },                          // integer centimetres
    (r) => { r.poses.a[0].frames = 1; },
    (r) => { r.poses.b.reverse(); },                                 // chronological
    (r) => { r.poses.b[1].startFrame = 1032; },                      // overlaps the previous run
    (r) => { r.poses.b[1].startFrame = 1200; },                      // starts in the camera cut (40–42 s)
    (r) => { r.poses.a[0].startFrame = 900; },                       // before the rally
  ];
  for (const mutate of mutations) {
    const input = rallyMotionFixture();
    mutate(input);
    assert.throws(() => parseRallyMotion(input, match), /Invalid rally motion/, String(mutate));
  }
});

test("contracts/ matches the schemas in contract.ts (run pnpm contracts after changing them)", async () => {
  for (const [name, text] of Object.entries(contractFiles())) {
    assert.equal(await readFile(join(import.meta.dirname, "../../contracts", name), "utf8"), text, name);
  }
});