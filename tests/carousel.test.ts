import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("uses no-JavaScript carousel controls without fragment navigation", async () => {
  for (const path of [
    "src/components/ScreenshotCarousel.astro",
    "src/components/FeaturedCarousel.astro",
  ]) {
    const component = await readFile(path, "utf8");

    assert.match(component, /type="radio"/, path);
    assert.match(component, /:checked/, path);
    assert.doesNotMatch(component, /href=\{`#/, path);
    assert.doesNotMatch(component, /aria-current=\{index === 0/, path);
  }
});

test("keeps enhanced carousel state synchronized with native choices", async () => {
  const carousel = await readFile("src/lib/carousel.ts", "utf8");

  assert.match(carousel, /choices: HTMLInputElement\[\]/);
  assert.match(carousel, /choice\.checked = index === current/);
  assert.match(carousel, /choice\.addEventListener\("change"/);
});

test("exposes fullscreen screenshots as a modal dialog", async () => {
  const carousel = await readFile("src/components/ScreenshotCarousel.astro", "utf8");

  assert.match(carousel, /setAttribute\("aria-modal", "true"\)/);
  assert.match(carousel, /removeAttribute\("aria-modal"\)/);
  assert.doesNotMatch(carousel, /toggleAttribute\("aria-modal"/);
});
