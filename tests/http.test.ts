import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPages, getJson } from "#scripts/releases/http";

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

test("reports rate-limit reset times", async () => {
  const reset = 1_800_000_000;
  const fetcher = () =>
    Promise.resolve(
      new Response(null, {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(reset),
        },
      })
    );

  await assert.rejects(
    getJson("https://api.github.com/example", undefined, fetcher),
    new RegExp(new Date(reset * 1000).toISOString())
  );
});
