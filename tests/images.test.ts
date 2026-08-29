import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { optimizeImageLoading } from "../src/client/image-loading";

test("uses native image loading priorities without redundant eager hints", async () => {
  const paths = (await readdir("src", { recursive: true }))
    .filter((path) => path.endsWith(".astro"))
    .map((path) => `src/${path}`);

  for (const path of paths) {
    const source = await readFile(path, "utf8");

    assert.doesNotMatch(source, /loading=(?:"eager"|\{[^}]*"eager")/, path);
    assert.doesNotMatch(source, /fetchpriority=(?:"auto"|\{[^}]*"auto")/, path);
  }

  const card = await readFile("src/components/AppCard.astro", "utf8");
  const footer = await readFile("src/components/Footer.astro", "utf8");
  const layout = await readFile("src/layouts/BaseLayout.astro", "utf8");

  assert.match(card, /data-optimize-loading/);
  assert.match(footer, /loading="lazy"/);
  assert.match(layout, /optimizeImageLoading/);
});

test("eagerly loads only marked images inside the viewport", () => {
  const visible = {
    loading: "lazy",
    getBoundingClientRect: () => ({ top: 100, bottom: 164 }),
  };
  const below = {
    loading: "lazy",
    getBoundingClientRect: () => ({ top: 900, bottom: 964 }),
  };
  const root = {
    querySelectorAll: () => [visible, below],
  } as unknown as ParentNode;

  optimizeImageLoading(root, 800);

  assert.equal(visible.loading, "eager");
  assert.equal(below.loading, "lazy");
});
