import assert from "node:assert/strict";
import test from "node:test";
import { plural, tendency, withArticle } from "./patterns.ts";

test("tendencies need a sample and read naturally", () => {
  const big = { n: 20, replies: [{ type: "lift" as const, count: 12 }, { type: "push" as const, count: 8 }] };
  assert.equal(tendency(big, "answers with"), "usually answers with a lift (60%, 12 of 20)");
  assert.equal(tendency({ n: 20, replies: [{ type: "lift", count: 9 }] }, "replies with")?.startsWith("most often"), true);
  assert.equal(tendency({ ...big, n: 5 }, "answers with"), null);
  assert.equal(tendency(undefined, "answers with"), null);
});

test("shot type words take the right article and plural", () => {
  assert.equal(plural("smash"), "smashes");
  assert.equal(plural("push"), "pushes");
  assert.equal(plural("cross_net"), "cross-court net shots");
  assert.equal(withArticle("net_shot"), "a net shot");
});
