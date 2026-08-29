import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { buttonClasses } from "../src/components/ui/buttonStyles";

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

test("uses color rather than underlines for active navigation links", async () => {
  const link = await readFile("src/components/ui/Link.astro", "utf8");

  assert.match(link, /aria-\[current=page\]:text-\[var\(--primary\)\]/);
  assert.doesNotMatch(link, /aria-\[current=page\]:border/);
  assert.doesNotMatch(link, /border-b/);
});

test("applies button hover styles to links", () => {
  for (const variant of ["icon", "outline", "primary"] as const) {
    const classes = buttonClasses(variant, "default");

    assert.match(classes, /hover:/);
    assert.doesNotMatch(classes, /enabled:hover:/);
  }
});
