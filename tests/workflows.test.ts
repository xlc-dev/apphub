import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("production always signs published catalog state", async () => {
  for (const file of ["pages.yml", "catalog-refresh.yml", "revoke.yml"]) {
    const workflow = await readFile(`.github/workflows/${file}`, "utf8");
    assert.doesNotMatch(workflow, /TUF_ENABLED/);
  }
});

test("production publishes media before building", async () => {
  const workflow = await readFile(".github/workflows/pages.yml", "utf8");
  const publish = workflow.indexOf("run: bun run publish-github-media");
  const build = workflow.indexOf("run: bun run build");

  assert.notEqual(publish, -1);
  assert.ok(build > publish);
});

test("automation commits generated state but never application manifests", async () => {
  for (const file of ["pages.yml", "catalog-refresh.yml"]) {
    const workflow = await readFile(`.github/workflows/${file}`, "utf8");
    const stagedPaths = [...workflow.matchAll(/^\s*git add (.+)$/gm)].map((match) => match[1]!);

    assert.ok(stagedPaths.length > 0, `${file} must stage generated publication state`);
    assert.ok(stagedPaths.every((paths) => !/(^|\s)apps(?:\/|\s|$)/.test(paths)));
    assert.ok(stagedPaths.every((paths) => paths.includes(".generated")));
  }
});

test("refresh batch artifacts extract into the directory expected by the finalizer", async () => {
  const workflow = await readFile(".github/workflows/catalog-refresh.yml", "utf8");

  assert.match(workflow, /path: \/tmp\/\$\{\{ matrix\.id \}\}\n/);
  assert.match(
    workflow,
    /pattern: batch-\*\n\s+path: \/tmp\/refresh-results\n\s+merge-multiple: true/
  );
});

test("repository statistics use the App token", async () => {
  const workflow = await readFile(".github/workflows/catalog-refresh.yml", "utf8");
  const token = workflow.indexOf("id: app-token");
  const statistics = workflow.indexOf("- name: Refresh statistics");

  assert.ok(token !== -1 && token < statistics);
  assert.match(
    workflow.slice(statistics),
    /GITHUB_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}\n\s+run: bun run update-downloads/
  );
});
