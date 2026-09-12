import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readRefreshResults } from "#scripts/refresh/finalize";

test("finds refresh results independently of artifact extraction layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "apphub-refresh-results-"));
  const directory = join(root, "artifact-wrapper", "batch-0000");
  const result = {
    id: "batch-0000",
    baseRevision: "a".repeat(64),
    slugs: ["example"],
    media: [],
    failures: [],
    inspections: [],
    digest: "b".repeat(64),
  };

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify(result));

    assert.deepEqual(await readRefreshResults(root), [{ directory, result }]);
  } finally {
    await rm(root, { recursive: true });
  }
});
