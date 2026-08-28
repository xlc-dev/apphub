import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("keeps the catalog usable without JavaScript", async () => {
  const catalog = await readFile("src/views/CatalogPage.astro", "utf8");
  const categories = await readFile("src/components/CategoryList.astro", "utf8");

  assert.match(catalog, /apps\.map\(/);
  assert.match(catalog, /<Pagination/);
  assert.match(categories, /<nav/);
  assert.match(categories, /href=\{categoryPath\(id\)\}/);
});

test("reveals JavaScript-only controls after initialization", async () => {
  const controls = [
    ["src/components/FeaturedCarousel.astro", "src/components/FeaturedCarousel.astro"],
    ["src/components/ScreenshotCarousel.astro", "src/components/ScreenshotCarousel.astro"],
    ["src/components/ThemeSelect.astro", "src/components/ThemeSelect.astro"],
  ] as const;

  for (const [componentPath, initializerPath] of controls) {
    const component = await readFile(componentPath, "utf8");
    const initializer = await readFile(initializerPath, "utf8");

    assert.match(component, /\shidden(?:\s|>)/, componentPath);
    assert.match(initializer, /\.hidden = false/, initializerPath);
  }

  const install = await readFile("src/components/InstallButton.astro", "utf8");

  assert.match(install, /class="[^"]*\binvisible\b[^"]*"/);
  assert.match(install, /class="[^"]*\bcontents\b[^"]*"/);
  assert.match(install, /\sinert(?:\s|>)/);
  assert.match(install, /classList\.remove\("invisible"\)/);

  const reservedControls = [
    ["src/components/CatalogFilters.astro", "src/client/catalog-search.ts"],
    ["src/components/CategoryList.astro", "src/components/CategoryList.astro"],
    ["src/components/Header.astro", "src/components/Header.astro"],
  ] as const;

  for (const [componentPath, initializerPath] of reservedControls) {
    const component = await readFile(componentPath, "utf8");
    const initializer = await readFile(initializerPath, "utf8");

    assert.match(component, /class="[^"]*\binvisible\b[^"]*"/, componentPath);
    assert.match(component, /\sinert(?:\s|>)/, componentPath);
    assert.doesNotMatch(component, /data-js-visible/, componentPath);
    assert.match(initializer, /classList\.remove\("invisible"\)/, initializerPath);
  }
});

test("keeps enhanced catalog pagination client-side", async () => {
  const search = await readFile("src/client/catalog-search.ts", "utf8");

  assert.match(search, /pagination\.addEventListener\("click"/);
  assert.match(search, /event\.button !== 0/);
  assert.match(search, /event\.metaKey/);
  assert.match(search, /event\.preventDefault\(\)/);
  assert.match(search, /history\.pushState\([^;]+link\.href\)/s);
});
