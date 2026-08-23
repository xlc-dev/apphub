import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPages } from "#scripts/releases/http";

test("collects every page", async () => {
  const pages = [[1, 2], [3]];

  assert.deepEqual(
    await collectPages((page) => Promise.resolve(pages[page - 1] ?? []), 2),
    [1, 2, 3]
  );
});

test("limits pagination", async () => {
  await assert.rejects(
    collectPages(() => Promise.resolve([1, 2]), 2, 3),
    /more than 3 items/
  );
});
