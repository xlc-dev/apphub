import { expect, test } from "bun:test";

test("routes links through base-aware components", async () => {
  const allowed = new Set([
    "src/components/ScreenshotCarousel.astro",
    "src/components/ui/ButtonLink.astro",
    "src/components/ui/Link.astro",
    "src/layouts/BaseLayout.astro",
  ]);
  const rawLinks: string[] = [];

  for await (const path of new Bun.Glob("src/**/*.astro").scan()) {
    if (!allowed.has(path) && /<a(?:\s|>)/.test(await Bun.file(path).text())) rawLinks.push(path);
  }

  expect(rawLinks).toEqual([]);
});
