import assert from "node:assert/strict";
import test from "node:test";
import type { MatchAnalysis, Shot } from "../contract.ts";
import { analysisFixture, correctedAnalysisFixture, typedAnalysisFixture } from "../test-fixtures.ts";
import { correctionNote, hasShotTypes, shotNoun, shotTypeConfidence, shotTypeView } from "./shot-types.ts";

const typed = typedAnalysisFixture() as unknown as MatchAnalysis;
const [serve, lift] = typed.rallies.r1.shots;

test("a confident type reads plainly; a weak one is marked as a guess; none means no type", () => {
  assert.deepEqual(shotTypeView(serve), {
    name: "short_serve", label: "Short serve", short: "Short serve", confident: true, corrected: false,
    probability: 0.9, runnerUp: "Long serve", runnerUpProbability: 0.06,
  });
  assert.equal(shotTypeView(lift)?.confident, false);
  const unclear = { ...lift, shotType: { ...lift.shotType!, name: null } } as Shot;
  assert.equal(shotTypeView(unclear)?.label, "Unclear");
  assert.equal(shotTypeView(unclear)?.confident, false);
  assert.equal(shotTypeView({ ...serve, shotType: undefined }), null);
});

test("confidence and nouns use the type only when the model is sure", () => {
  assert.equal(shotTypeConfidence(serve), "Model: 90% · else Long serve 6%");
  assert.match(shotTypeConfidence({ ...lift, shotType: { ...lift.shotType!, name: null } } as Shot)!, /^No clear stroke type · closest Push 38%/);
  assert.equal(shotNoun(serve), "short serve");
  assert.equal(shotNoun(lift), "shot");
});

test("an analysis has shot types when it names their model", () => {
  assert.equal(hasShotTypes(typed), true);
  assert.equal(hasShotTypes(analysisFixture() as unknown as MatchAnalysis), false);
});

test("a physics correction reads as confident and explains itself from the flight", () => {
  const corrected = (correctedAnalysisFixture() as unknown as MatchAnalysis).rallies.r1.shots[1];
  assert.equal(shotTypeView(corrected)?.confident, true);
  assert.equal(shotNoun(corrected), "lift");
  assert.equal(shotTypeConfidence(corrected), "Corrected by the measured flight");
  // fixture: apex 3 m, placement y 2.4 (4.3 m past the net)
  assert.equal(correctionNote(corrected), "The model said Push (55%); corrected because it rose to 3.0 m and went 4.3 m past the net, which a push doesn’t.");
  assert.equal(correctionNote(serve), null);
});
