import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("all site media uses immutable GitHub Release URLs", async () => {
  const source = await readFile("src/lib/media-loader.ts", "utf8");

  assert.match(source, /releases\/download\/\$\{asset\.tag\}/);
  assert.match(source, /githubMediaMapSchema/);
  assert.match(source, /resolve\("\.generated\/media-map\.json"\)/);
  assert.doesNotMatch(source, /import\.meta\.url/);
  assert.doesNotMatch(source, /latest\/download/);
  assert.doesNotMatch(source, /\?raw=/);
  assert.doesNotMatch(source, /\.generated\/media\//);
});

test("featured images use the same release media loader", async () => {
  const source = await readFile("src/pages/featured/[slug].webp.ts", "utf8");

  assert.match(source, /mediaBytes/);
  assert.doesNotMatch(source, /\.generated\/media/);
});
