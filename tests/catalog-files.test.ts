import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readApps } from "@catalog/core";
import sharp from "sharp";

const temporaryDirectories: string[] = [];
const app = {
  id: "org.example.App",
  name: "Example App",
  summary: "A synthetic fixture",
  description: "A synthetic application used to test catalog files.",
  projectLicense: "MIT",
  developer: { name: "Example Developers" },
  homepage: "https://example.org/",
  addedAt: "2026-08-20",
  categories: ["Utility"],
  source: "community",
  releaseSource: { type: "github", repository: "example/app" },
  icon: { license: "CC0-1.0", source: "https://example.org/icon.webp" },
  screenshots: [
    {
      file: "screenshot-1.webp",
      caption: "Main window",
      license: "CC0-1.0",
      source: "https://example.org/screenshot.webp",
    },
  ],
  expectedAccess: [],
};

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "apphub-test-"));

  temporaryDirectories.push(path);

  return path;
}

async function writeApp(root: string, slug = "example-app", manifest = app) {
  const directory = join(root, slug);
  const image = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();

  await mkdir(directory);
  await writeFile(join(directory, "icon.webp"), image);
  await writeFile(join(directory, "screenshot-1.webp"), image);
  await writeFile(join(directory, "app.json"), JSON.stringify(manifest));

  return directory;
}

async function expectReadError(root: string, message: string) {
  let error: unknown;

  try {
    await readApps(pathToFileURL(`${root}/`));
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
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
    await writeApp(root);

    const entries = await readApps(pathToFileURL(`${root}/`));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.slug).toBe("example-app");
    expect(entries[0]?.hasLock).toBe(false);
    expect(entries[0]?.lock).toEqual({ appId: "org.example.App", releases: [] });
  });

  test("rejects unexpected catalog files", async () => {
    const root = await temporaryDirectory();
    const directory = await writeApp(root);

    await writeFile(join(directory, "notes.txt"), "unexpected");

    await expectReadError(root, "example-app: unexpected file notes.txt");
  });

  test("rejects symlinked catalog files", async () => {
    const root = await temporaryDirectory();
    const directory = await writeApp(root);

    await rm(join(directory, "icon.webp"));
    await symlink("screenshot-1.webp", join(directory, "icon.webp"));

    await expectReadError(root, "must be a regular file");
  });

  test("rejects oversized manifests", async () => {
    const root = await temporaryDirectory();
    const directory = await writeApp(root);

    await writeFile(join(directory, "app.json"), " ".repeat(64 * 1024 + 1));

    await expectReadError(root, "file is too large");
  });

  test("rejects missing and unreferenced screenshots", async () => {
    const missingRoot = await temporaryDirectory();
    const unreferencedRoot = await temporaryDirectory();
    const missingDirectory = await writeApp(missingRoot);
    const unreferencedDirectory = await writeApp(unreferencedRoot);

    await rm(join(missingDirectory, "screenshot-1.webp"));
    await writeFile(join(unreferencedDirectory, "screenshot-2.webp"), "not inspected");

    await expectReadError(missingRoot, "example-app: missing screenshot screenshot-1.webp");
    await expectReadError(
      unreferencedRoot,
      "example-app: unreferenced screenshot screenshot-2.webp"
    );
  });

  test("rejects mismatched release locks", async () => {
    const root = await temporaryDirectory();
    const directory = await writeApp(root);

    await writeFile(
      join(directory, "releases.json"),
      JSON.stringify({ appId: "org.example.Other", releases: [] })
    );

    await expectReadError(root, "example-app: release lock has the wrong application id");
  });

  test("rejects duplicate application ids", async () => {
    const root = await temporaryDirectory();

    await writeApp(root, "example-app");
    await writeApp(root, "other-app");

    await expectReadError(root, "Duplicate application id: org.example.App");
  });
});
