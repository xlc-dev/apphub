import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("does not mark app detail pages as the current catalog page", async () => {
  const header = await readFile("src/components/Header.astro", "utf8");

  assert.doesNotMatch(header, /path\.startsWith\("\/apps\/"\)/);
  assert.match(header, /path === "\/apps\/"/);
  assert.match(header, /\/apps\\\/page/);
});
