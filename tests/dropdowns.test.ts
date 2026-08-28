import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("animates menu dropdowns without affecting disclosure content", async () => {
  const components = [
    "src/components/ThemeSelect.astro",
    "src/components/CatalogFilters.astro",
    "src/components/Header.astro",
  ];

  for (const path of components) {
    assert.match(await readFile(path, "utf8"), /data-dropdown-panel/, path);
  }

  const styles = await readFile("src/global.css", "utf8");

  assert.match(styles, /@keyframes dropdown-in/);
  assert.match(styles, /details\[open\] > \[data-dropdown-panel\]/);
  assert.match(styles, /details\[open\] > \[data-dropdown-panel\]\s*{\s*animation: none;/);
});

test("keeps filter count badges out of the button layout", async () => {
  const filters = await readFile("src/components/CatalogFilters.astro", "utf8");

  assert.match(filters, /class="invisible absolute [^"]+"\s+data-filter-count/);
});
