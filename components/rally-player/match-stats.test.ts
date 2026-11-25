import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch, parseMetadata } from "./contract.ts";
import { headToHead, scoreFlow } from "./match-stats.ts";
import { analysisFixture, matchFixture, metadataFixture, typedAnalysisFixture } from "./test-fixtures.ts";

const match = parseMatch(matchFixture());

test("score flow follows the lead before each scored rally, by game", () => {
  assert.deepEqual(scoreFlow(match), [
    { game: 1, points: [{ index: 0, lead: 0 }, { index: 1, lead: -1 }], final: null },
    { game: 2, points: [], final: null },
  ]);
});

test("score flow closes a game on its final score when it is known", () => {
  const fixture = matchFixture();
  fixture.rallies[1].winner = "a";
  const [first] = scoreFlow(parseMatch(fixture));
  assert.deepEqual(first.points.at(-1), { index: null, lead: 0 });
  assert.equal(first.final, "1–1");

  const analysis = analysisFixture();
  analysis.games[0].final = { a: 19, b: 21 };
  const parsed = parseMetadata(metadataFixture(matchFixture(), analysis));
  const [withAnalysis] = scoreFlow(parsed.match, parsed.analysis ?? undefined);
  assert.deepEqual(withAnalysis.points.at(-1), { index: null, lead: -2 });
  assert.equal(withAnalysis.final, "19–21");
});

test("head to head counts points and serves from the detected rallies", () => {
  assert.deepEqual(headToHead(match), [
    { label: "Rallies won", values: [0, 1] },
    { label: "Won on own serve", values: [0, 0], detail: ["0/1", "0/0"] },
  ]);
});

test("head to head adds measured and model rows only when the analysis has them", () => {
  const plain = parseMetadata(metadataFixture());
  assert.deepEqual(headToHead(plain.match, plain.analysis ?? undefined).map((row) => row.label),
    ["Rallies won", "Won on own serve", "Long rallies won", "Fastest shot"]);
  const fastest = headToHead(plain.match, plain.analysis ?? undefined).find((row) => row.label === "Fastest shot");
  assert.deepEqual(fastest, { label: "Fastest shot", tag: "est", values: [72, 72], unit: "km/h" });

  const typed = parseMetadata(metadataFixture(matchFixture(), typedAnalysisFixture()));
  const smashes = headToHead(typed.match, typed.analysis ?? undefined).find((row) => row.label === "Smashes");
  assert.deepEqual(smashes, { label: "Smashes", tag: "model", values: [0, 0] });
});
