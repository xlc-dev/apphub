import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readApps } from "@catalog/core";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "apphub-test-"));

  temporaryDirectories.push(path);

  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("catalog files", () => {
  test("accepts a missing catalog directory", async () => {
    const root = await temporaryDirectory();

    expect(await readApps(pathToFileURL(`${join(root, "missing")}/`))).toEqual([]);
  });

  test("reads a synthetic app without a release lock", async () => {
    const root = await temporaryDirectory();
    const directory = join(root, "example-app");

    await mkdir(directory);
    await writeFile(
      join(directory, "app.json"),
      JSON.stringify({
        id: "org.example.App",
        name: "Example App",
        summary: "A synthetic fixture",
        releaseSource: { type: "github", repository: "example/app" },
        icon: "https://example.org/icon.png",
        screenshots: [{ url: "https://example.org/screenshot.png" }],
        security: { isolation: "none", expectedAccess: [] },
      })
    );

    const entries = await readApps(pathToFileURL(`${root}/`));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.slug).toBe("example-app");
    expect(entries[0]?.hasLock).toBe(false);
    expect(entries[0]?.lock).toEqual({ appId: "org.example.App", releases: [] });
  });
});
