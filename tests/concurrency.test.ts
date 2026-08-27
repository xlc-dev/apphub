import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forEachConcurrent } from "#scripts/concurrency";

describe("bounded concurrency", () => {
  test("never exceeds the worker limit", async () => {
    let active = 0;
    let maximum = 0;

    await forEachConcurrent([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });

    assert.equal(maximum, 2);
  });

  test("reports the earliest input error deterministically", async () => {
    await assert.rejects(
      forEachConcurrent([0, 1, 2], 3, async (value) => {
        await new Promise((resolve) => setTimeout(resolve, value === 0 ? 10 : 1));
        throw new Error(`item ${value}`);
      }),
      /item 0/
    );
  });
});
