import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { readApps } from "#catalog/core";
import sharp from "sharp";

const temporaryDirectories: string[] = [];

const metadata = {
  id: "org.example.App",
  name: "Example App",
  summary: "A synthetic fixture",
  description: [
    {
      type: "paragraph",
      content: [{ type: "text", value: "A synthetic application used to test catalog files." }],
    },
  ],
  projectLicense: "MIT",
  developer: { name: "Example Developers" },
  homepage: "https://example.org/",
  categories: ["Utility"],
};

const app = {
  appstream: {
    type: "manual",
    metadata,
    media: {
      icon: "https://example.org/icon.webp",
      screenshots: [{ caption: "Main window", source: "https://example.org/screenshot.webp" }],
    },
  },
  addedAt: "2026-08-20",
  source: "community",
  releaseSource: { type: "github", repository: "example/app" },
  sandbox: {
    network: "none",
    display: "wayland",
    audio: "none",
    processes: "isolated",
    ipc: false,
    filesystem: [],
    devices: [],
    portals: ["file-chooser"],
    sessionBus: [],
    systemBus: [],
  },
};

const media = {
  icon: { file: "icon.webp", source: "https://example.org/icon.webp" },
  screenshots: [
    {
      file: "screenshot-1.webp",
      caption: "Main window",
      source: "https://example.org/screenshot.webp",
    },
  ],
};

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "apphub-test-"));

  temporaryDirectories.push(path);

  return path;
}

async function writeApp(root: string, slug = "example-app", manifest = app) {
  const source = join(root, "apps", slug);
  const generated = join(root, "generated", slug);
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

  await mkdir(source, { recursive: true });
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, "icon.webp"), image);
  await writeFile(join(generated, "screenshot-1.webp"), image);
  await writeFile(join(source, "app.json"), JSON.stringify(manifest));
  await writeFile(join(generated, "media.json"), JSON.stringify(media));
  await writeFile(join(generated, "appstream.json"), JSON.stringify(metadata));

  return { source, generated };
}

async function expectReadError(root: string, message: string) {
  let error: unknown;

  try {
    await readApps(
      pathToFileURL(`${join(root, "apps")}/`),
      pathToFileURL(`${join(root, "generated")}/`)
    );
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof Error);
  assert.match(error.message, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("catalog files", () => {
  test("accepts a missing catalog directory", async () => {
    const root = await temporaryDirectory();

    assert.deepEqual(
      await readApps(
        pathToFileURL(`${join(root, "missing")}/`),
        pathToFileURL(`${join(root, "generated")}/`)
      ),
      []
    );
  });

  test("reads a synthetic app without a release lock", async () => {
    const root = await temporaryDirectory();
    await writeApp(root);

    const entries = await readApps(
      pathToFileURL(`${join(root, "apps")}/`),
      pathToFileURL(`${join(root, "generated")}/`)
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.slug, "example-app");
    assert.equal(entries[0]?.hasLock, false);
    assert.deepEqual(entries[0]?.lock, { appId: "org.example.App", releases: [] });
  });

  test("rejects unexpected catalog files", async () => {
    const root = await temporaryDirectory();
    const { source } = await writeApp(root);

    await writeFile(join(source, "notes.txt"), "unexpected");

    await expectReadError(root, "example-app: unexpected file notes.txt");
  });

  test("rejects symlinked catalog files", async () => {
    const root = await temporaryDirectory();
    const { generated } = await writeApp(root);

    await rm(join(generated, "icon.webp"));
    await symlink("screenshot-1.webp", join(generated, "icon.webp"));

    await expectReadError(root, "must be a regular file");
  });

  test("rejects oversized manifests", async () => {
    const root = await temporaryDirectory();
    const { source } = await writeApp(root);

    await writeFile(join(source, "app.json"), " ".repeat(64 * 1024 + 1));

    await expectReadError(root, "file is too large");
  });

  test("rejects missing and unreferenced screenshots", async () => {
    const missingRoot = await temporaryDirectory();
    const unreferencedRoot = await temporaryDirectory();
    const { generated: missingDirectory } = await writeApp(missingRoot);
    const { generated: unreferencedDirectory } = await writeApp(unreferencedRoot);

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
    const { generated } = await writeApp(root);

    await writeFile(
      join(generated, "releases.json"),
      JSON.stringify({ appId: "org.example.Other", releases: [] })
    );

    await expectReadError(root, "example-app: release lock has the wrong application id");
  });

  test("rejects mismatched AppStream metadata", async () => {
    const root = await temporaryDirectory();
    const { generated } = await writeApp(root);

    await writeFile(
      join(generated, "appstream.json"),
      JSON.stringify({ ...metadata, id: "org.example.Other" })
    );

    await expectReadError(root, "example-app: AppStream metadata has the wrong application id");
  });

  test("rejects duplicate application ids", async () => {
    const root = await temporaryDirectory();

    await writeApp(root, "example-app");
    await writeApp(root, "other-app");

    await expectReadError(root, "Duplicate application id: org.example.App");
  });
});
