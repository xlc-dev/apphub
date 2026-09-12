import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

test("provides installable app metadata without offline caching", async () => {
  const layout = await readFile("src/layouts/BaseLayout.astro", "utf8");
  const manifest: unknown = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));

  assert.match(layout, /rel="manifest" href=\{sitePath\("\/manifest\.webmanifest"\)\}/);
  assert.deepEqual(manifest, {
    name: "AppHub",
    short_name: "AppHub",
    description: "The universal AppImage store.",
    id: "./",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [{ src: "logo.svg", sizes: "any", type: "image/svg+xml" }],
  });

  const files = await readdir("src", { recursive: true });
  assert.ok(files.every((file) => !/service.*worker/i.test(file)));
});
