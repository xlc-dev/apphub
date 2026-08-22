import { expect, test } from "bun:test";
import { paginationState } from "@/lib/pagination";

test("paginates eighteen items at a time", () => {
  expect(paginationState(37, 1)).toEqual({ page: 1, pages: 3, start: 0, end: 18 });
  expect(paginationState(37, 2)).toEqual({ page: 2, pages: 3, start: 18, end: 36 });
  expect(paginationState(37, 3)).toEqual({ page: 3, pages: 3, start: 36, end: 37 });
});

test("bounds invalid and empty pages", () => {
  expect(paginationState(0, 9)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
  expect(paginationState(3, 0)).toEqual({ page: 1, pages: 1, start: 0, end: 3 });
  expect(paginationState(30, 99)).toEqual({ page: 2, pages: 2, start: 18, end: 30 });
  expect(paginationState(30, Number.NaN)).toEqual({ page: 1, pages: 2, start: 0, end: 18 });
});
