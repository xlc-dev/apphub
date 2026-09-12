import assert from "node:assert/strict";
import { test } from "node:test";
import { paginationState } from "#lib/pagination";

test("paginates thirty items at a time", () => {
  assert.deepEqual(paginationState(67, 1), { page: 1, pages: 3, start: 0, end: 30 });
  assert.deepEqual(paginationState(67, 2), { page: 2, pages: 3, start: 30, end: 60 });
  assert.deepEqual(paginationState(67, 3), { page: 3, pages: 3, start: 60, end: 67 });
});

test("bounds invalid and empty pages", () => {
  assert.deepEqual(paginationState(0, 9), { page: 1, pages: 1, start: 0, end: 0 });
  assert.deepEqual(paginationState(3, 0), { page: 1, pages: 1, start: 0, end: 3 });
  assert.deepEqual(paginationState(31, 99), { page: 2, pages: 2, start: 30, end: 31 });
  assert.deepEqual(paginationState(30, Number.NaN), {
    page: 1,
    pages: 1,
    start: 0,
    end: 30,
  });
});
