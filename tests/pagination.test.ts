import assert from "node:assert/strict";
import { test } from "node:test";
import { paginationState } from "#lib/pagination";

test("paginates eighteen items at a time", () => {
  assert.deepEqual(paginationState(37, 1), { page: 1, pages: 3, start: 0, end: 18 });
  assert.deepEqual(paginationState(37, 2), { page: 2, pages: 3, start: 18, end: 36 });
  assert.deepEqual(paginationState(37, 3), { page: 3, pages: 3, start: 36, end: 37 });
});

test("bounds invalid and empty pages", () => {
  assert.deepEqual(paginationState(0, 9), { page: 1, pages: 1, start: 0, end: 0 });
  assert.deepEqual(paginationState(3, 0), { page: 1, pages: 1, start: 0, end: 3 });
  assert.deepEqual(paginationState(30, 99), { page: 2, pages: 2, start: 18, end: 30 });
  assert.deepEqual(paginationState(30, Number.NaN), {
    page: 1,
    pages: 2,
    start: 0,
    end: 18,
  });
});
