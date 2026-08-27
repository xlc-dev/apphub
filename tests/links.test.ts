import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

test("routes links through base-aware components", async () => {
  const allowed = new Set([
    "src/components/ScreenshotCarousel.astro",
    "src/components/ui/ButtonLink.astro",
    "src/components/ui/Link.astro",
    "src/layouts/BaseLayout.astro",
  ]);
  const rawLinks: string[] = [];

  const paths = (await readdir("src", { recursive: true }))
    .filter((path) => path.endsWith(".astro"))
    .map((path) => `src/${path}`);

  for (const path of paths) {
    if (!allowed.has(path) && /<a(?:\s|>)/.test(await readFile(path, "utf8"))) {
      rawLinks.push(path);
    }
  }

  assert.deepEqual(rawLinks, []);
});
