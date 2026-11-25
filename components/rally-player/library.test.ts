import assert from "node:assert/strict";
import test from "node:test";
import { groupMatchesByEvent, splitMatchTitle } from "./library.ts";

test("splits an event from its round", () => {
  assert.deepEqual(splitMatchTitle("VICTOR China Open 2025, men’s singles final"), { event: "VICTOR China Open 2025", round: "Men’s singles final" });
  assert.deepEqual(splitMatchTitle("Open, Day 2, men’s singles semifinal"), { event: "Open, Day 2", round: "Men’s singles semifinal" });
  assert.deepEqual(splitMatchTitle("Exhibition"), { event: "Exhibition", round: null });
});

test("groups matches by event, final first", () => {
  const match = (matchId: string, title: string) => ({ match: { matchId, title } });
  const groups = groupMatchesByEvent([
    match("a-sf1", "A Open, men’s singles semifinal"),
    match("a-f", "A Open, men’s singles final"),
    match("b-x", "B Open, exhibition"),
    match("a-qf", "A Open, men’s singles quarterfinal"),
    match("a-sf2", "A Open, men’s singles semifinal"),
    match("b-f", "B Open, women’s singles final"),
  ]);
  assert.deepEqual(groups.map((group) => [group.event, group.items.map((item) => item.match.matchId)]), [
    ["A Open", ["a-f", "a-sf1", "a-sf2", "a-qf"]],
    ["B Open", ["b-f", "b-x"]],
  ]);
});
