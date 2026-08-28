import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("uses native cross-document transitions with stable critical content", async () => {
  const layout = await readFile("src/layouts/BaseLayout.astro", "utf8");
  const styles = await readFile("src/global.css", "utf8");

  assert.match(styles, /@view-transition\s*{\s*navigation: auto;/);
  assert.match(layout, /rel="expect" href="#main-content" blocking="render"/);
  assert.match(styles, /view-transition-name: app-header/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("prefetches likely internal navigations without preloading every link", async () => {
  const layout = await readFile("src/layouts/BaseLayout.astro", "utf8");

  assert.match(layout, /type="speculationrules"/);
  assert.match(layout, /"source": "document"/);
  assert.match(layout, /"href_matches": "\/\*"/);
  assert.match(layout, /"eagerness": "moderate"/);
  assert.doesNotMatch(layout, /"eagerness": "immediate"/);
});
