import { expect, test } from "bun:test";
import { paginationState } from "@/lib/pagination";

test("paginates twelve items at a time", () => {
  expect(paginationState(25, 1)).toEqual({ page: 1, pages: 3, start: 0, end: 12 });
  expect(paginationState(25, 2)).toEqual({ page: 2, pages: 3, start: 12, end: 24 });
  expect(paginationState(25, 3)).toEqual({ page: 3, pages: 3, start: 24, end: 25 });
});

test("bounds invalid and empty pages", () => {
  expect(paginationState(0, 9)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
  expect(paginationState(3, 0)).toEqual({ page: 1, pages: 1, start: 0, end: 3 });
  expect(paginationState(20, 99)).toEqual({ page: 2, pages: 2, start: 12, end: 20 });
  expect(paginationState(20, Number.NaN)).toEqual({ page: 1, pages: 2, start: 0, end: 12 });
});
