import { expect, test } from "bun:test";
import { paginationState } from "@/lib/pagination";

test("paginates twenty-four items at a time", () => {
  expect(paginationState(49, 1)).toEqual({ page: 1, pages: 3, start: 0, end: 24 });
  expect(paginationState(49, 2)).toEqual({ page: 2, pages: 3, start: 24, end: 48 });
  expect(paginationState(49, 3)).toEqual({ page: 3, pages: 3, start: 48, end: 49 });
});

test("bounds invalid and empty pages", () => {
  expect(paginationState(0, 9)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
  expect(paginationState(3, 0)).toEqual({ page: 1, pages: 1, start: 0, end: 3 });
  expect(paginationState(30, 99)).toEqual({ page: 2, pages: 2, start: 24, end: 30 });
  expect(paginationState(30, Number.NaN)).toEqual({ page: 1, pages: 2, start: 0, end: 24 });
});
