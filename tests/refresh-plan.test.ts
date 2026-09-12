import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRefreshPlan,
  maximumRefreshBatchSize,
  validateRefreshResults,
} from "#catalog/refresh-plan";

test("refresh planning creates deterministic batches of at most 50 apps", () => {
  const slugs = Array.from({ length: 4000 }, (_, index) => `app-${String(index).padStart(4, "0")}`);
  const plan = createRefreshPlan([...slugs].reverse());

  assert.equal(plan.batches.length, 80);
  assert.ok(plan.batches.every(({ slugs: batch }) => batch.length <= maximumRefreshBatchSize));
  assert.deepEqual(plan.batches[0]?.slugs, slugs.slice(0, 50));
  assert.deepEqual(plan.batches.at(-1)?.slugs, slugs.slice(-50));
});

test("refresh planning removes duplicate apps", () => {
  const plan = createRefreshPlan(["second", "first", "second"], 1);

  assert.deepEqual(plan.batches, [
    { id: "batch-0000", slugs: ["first"] },
    { id: "batch-0001", slugs: ["second"] },
  ]);
});

test("refresh planning rejects oversized batches", () => {
  assert.throws(() => createRefreshPlan(["app"], 51), /between 1 and 50/);
});

test("missing worker output prevents finalization", () => {
  const plan = createRefreshPlan(["first", "second"], 1);

  assert.throws(
    () =>
      validateRefreshResults(plan, "a".repeat(64), [
        { id: "batch-0000", baseRevision: "a".repeat(64), slugs: ["first"] },
      ]),
    /incomplete/
  );
});

test("results from another catalog revision prevent finalization", () => {
  const plan = createRefreshPlan(["first"]);

  assert.throws(
    () =>
      validateRefreshResults(plan, "a".repeat(64), [
        { id: "batch-0000", baseRevision: "b".repeat(64), slugs: ["first"] },
      ]),
    /different base catalog revision/
  );
});
