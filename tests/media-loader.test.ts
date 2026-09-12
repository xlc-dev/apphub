import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("site media uses the generated media directory", async () => {
  const source = await readFile("src/lib/media-loader.ts", "utf8");

  assert.match(source, /import\.meta\.glob/);
  assert.match(source, /\.generated\/media/);
});

test("featured images use the same media loader", async () => {
  const source = await readFile("src/pages/featured/[slug].webp.ts", "utf8");

  assert.match(source, /mediaBytes/);
  assert.doesNotMatch(source, /\.generated\/media/);
});
