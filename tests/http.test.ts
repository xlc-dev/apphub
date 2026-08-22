import { expect, test } from "bun:test";
import { collectPages } from "../scripts/releases/http";

test("collects every page", async () => {
  const pages = [[1, 2], [3]];

  expect(await collectPages((page) => Promise.resolve(pages[page - 1] ?? []), 2)).toEqual([
    1, 2, 3,
  ]);
});

test("limits pagination", () => {
  expect(collectPages(() => Promise.resolve([1, 2]), 2, 3)).rejects.toThrow("more than 3 items");
});
