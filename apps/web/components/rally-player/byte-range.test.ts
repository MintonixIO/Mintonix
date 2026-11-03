import assert from "node:assert/strict";
import test from "node:test";
import { parseByteRange } from "./byte-range.ts";

test("full, bounded, open-ended, and suffix media requests", () => {
  assert.deepEqual(parseByteRange(null, 100), { start: 0, end: 99, partial: false });
  assert.deepEqual(parseByteRange("bytes=0-0", 100), { start: 0, end: 0, partial: true });
  assert.deepEqual(parseByteRange("bytes=20-39", 100), { start: 20, end: 39, partial: true });
  assert.deepEqual(parseByteRange("bytes=80-", 100), { start: 80, end: 99, partial: true });
  assert.deepEqual(parseByteRange("bytes=-20", 100), { start: 80, end: 99, partial: true });
  assert.deepEqual(parseByteRange("bytes=-200", 100), { start: 0, end: 99, partial: true });
  assert.deepEqual(parseByteRange("bytes=80-200", 100), { start: 80, end: 99, partial: true });
});

test("unsatisfiable and malformed media ranges are rejected", () => {
  for (const value of ["bytes=100-", "bytes=50-20", "bytes=-0", "bytes=-", "items=0-10",
    "bytes=0-1,5-6", "bytes=NaN-", "bytes=9999999999999999999-", "bytes=0-9999999999999999999"]) {
    assert.equal(parseByteRange(value, 100), null, value);
  }
});
