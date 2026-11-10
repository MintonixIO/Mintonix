/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate fixtures into arbitrary invalid shapes */
// Synthetic match data for the rally-player tests only; contracts/ holds the generated schemas.
export function matchFixture() {
  return {
    version: 3,
    matchId: "illustrative-match",
    title: "Player A vs Player B",
    players: [{ id: "a", name: "Player A" }, { id: "b", name: "Player B" }],
    source: { provider: "youtube", videoId: "AAAAAAAAAAA", durationSeconds: 910 },
    review: "automatic",
    rallies: [
      { id: "r1", game: 1, segments: [[34, 40], [42, 48]], scoreBefore: { a: 0, b: 0 }, server: "a", winner: "b" },
      { id: "r2", game: 1, segments: [[72, 89]], scoreBefore: { a: 0, b: 1 } },
      { id: "r3", game: 2, segments: [[112, 121]] },
    ],
  } as Record<string, any>;
}

export function shot(start: number, end: number, hitter: string | null = "a") {
  return {
    hitter, startSeconds: start, endSeconds: end, startContact: "racket", endContact: "racket",
    speed: 20, arrivalSpeed: 8, contact: [3, 2, 1], end: [3, 11, 0.8], apex: 3, netClearance: 0.4,
    launchAngle: 20, descentAngle: -30, hitterEnd: "far", placement: [3.1, 2.4], quality: "ok", issues: [],
    path: [[start, 3, 2, 1], [end, 3, 11, 0.8]],
  };
}

export function analysisFixture() {
  const distribution = { n: 1, median: 20, p10: 20, p90: 20, max: 20 };
  const player = {
    shots: 1, okShots: 1, speed: distribution, apex: distribution, contactHeight: distribution,
    netClearance: { n: 0 }, placements: [[3.1, 2.4, 0.8, "racket"]], pointsWon: 1,
    pointsWithKnownWinner: 1, serves: 1, pointsWonOnServe: 0,
  };
  return {
    version: 2, matchId: "illustrative-match", quality: { shots: 2, ok: 2, guessed: 0, unreliable: 0 },
    rallies: { r1: { shots: [shot(34.5, 35.3), shot(35.3, 36, "b")],
      summary: { shots: 2, unreliable: 0, byPlayer: { a: 1, b: 1 }, fastest: 0, highest: 0 } } },
    games: [
      { game: 1, final: null, winner: null, rallies: 2, longest: "r1", averageShots: 1 },
      { game: 2, final: null, winner: null, rallies: 1, longest: null, averageShots: 0 },
    ],
    players: { a: player, b: player },
  } as Record<string, any>;
}

/** The analysis fixture with model shot types on both shots. */
export function typedAnalysisFixture() {
  const analysis = analysisFixture();
  analysis.shotTypes = { model: "Model", training: "Training set", source: "https://example.com/model", order: ["lift", "short_serve"] };
  const summary = (count: number, endedRally = 0) => ({
    count, okShots: count, speed: { n: count, median: 20, p10: 18, p90: 22, max: 23 }, apex: { n: 0 }, contactHeight: { n: 0 },
    netClearance: { n: 0 }, endedRally, endedRallyWon: endedRally, endedRallyKnownWinner: endedRally,
  });
  analysis.players.a = { ...analysis.players.a, shotTypes: { typed: 1, unclear: 0, byType: { short_serve: summary(1) } } };
  analysis.players.b = { ...analysis.players.b, shotTypes: { typed: 1, unclear: 2, byType: { lift: summary(1, 1) } } };
  analysis.patterns = {
    responses: { a: {}, b: { short_serve: { n: 10, replies: [{ type: "lift", count: 6 }, { type: "push", count: 4 }] } } },
    followUps: { a: { short_serve: { n: 10, replies: [{ type: "lift", count: 6 }, { type: "push", count: 4 }] } }, b: {} },
  };
  analysis.rallies.r1.shots[0].shotType = { name: "short_serve", probability: 0.9, runnerUp: "long_serve", runnerUpProbability: 0.06 };
  analysis.rallies.r1.shots[1].shotType = { name: "lift", probability: 0.42, runnerUp: "push", runnerUpProbability: 0.38 };
  return analysis;
}

/** The typed fixture with the second shot relabelled from push to lift by its flight. */
export function correctedAnalysisFixture() {
  const analysis = typedAnalysisFixture();
  analysis.rallies.r1.shots[1].shotType.correction = { from: "push", fromProbability: 0.55, reason: "high_deep_flight" };
  return analysis;
}
