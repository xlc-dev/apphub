import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { readApps, validateCatalogIdentities } from "#catalog/storage";
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
  origin: { type: "third-party" },
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

const provenance = {
  metadata: {
    provider: "manifest",
    providerId: metadata.id,
  },
  releaseSource: {
    provider: "github",
    configuredUrl: "https://github.com/example/app",
    sourceUrl: "https://github.com/example/app",
    projectId: "1",
    ownerId: "2",
  },
  refresh: {
    metadata: {
      lastAttemptAt: "2026-08-20T00:00:00Z",
      lastSuccessAt: "2026-08-20T00:00:00Z",
    },
    releases: {
      lastAttemptAt: "2026-08-20T00:00:00Z",
      lastSuccessAt: "2026-08-20T00:00:00Z",
    },
  },
};

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "apphub-test-"));

  temporaryDirectories.push(path);

  return path;
}

async function writeApp(root: string, slug = "example-app", manifest = app) {
  const appsDirectory = join(root, "apps");
  const source = join(appsDirectory, `${slug}.json`);
  const generated = join(root, "generated", slug);
  const mediaDirectory = join(root, "media");
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
  const mediaFile = `${createHash("sha256").update(image).digest("hex")}.webp`;
  const media = {
    icon: { file: mediaFile, source: "https://example.org/icon.webp" },
    screenshots: [
      {
        file: mediaFile,
        caption: "Main window",
        source: "https://example.org/screenshot.webp",
      },
    ],
  };

  await mkdir(appsDirectory, { recursive: true });
  await mkdir(generated, { recursive: true });
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(join(mediaDirectory, mediaFile), image);
  await writeFile(source, JSON.stringify(manifest));
  await writeFile(join(generated, "media.json"), JSON.stringify(media));
  await writeFile(join(generated, "appstream.json"), JSON.stringify(metadata));
  await writeFile(join(generated, "provenance.json"), JSON.stringify(provenance));

  return { source, generated, mediaDirectory, mediaFile };
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
  test("rejects duplicate application identities", () => {
    assert.throws(
      () => validateCatalogIdentities([{ id: "org.example.App" }, { id: "org.example.App" }]),
      /Duplicate application id/
    );
  });

  test("requires a catalog directory", async () => {
    const root = await temporaryDirectory();

    await assert.rejects(
      readApps(
        pathToFileURL(`${join(root, "missing")}/`),
        pathToFileURL(`${join(root, "generated")}/`)
      ),
      /ENOENT/
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
    const [entry] = entries;

    assert.ok(entry);
    assert.equal(entry.slug, "example-app");
    assert.equal(entry.hasLock, false);
    assert.deepEqual(entry.lock, { appId: "org.example.App", releases: [] });
  });

  test("rejects unexpected catalog entries", async () => {
    const root = await temporaryDirectory();
    await writeApp(root);

    await writeFile(join(root, "apps", "notes.txt"), "unexpected");

    await expectReadError(root, "Unexpected catalog entry: notes.txt");
  });

  test("rejects symlinked catalog files", async () => {
    const root = await temporaryDirectory();
    const { mediaDirectory, mediaFile } = await writeApp(root);

    await rm(join(mediaDirectory, mediaFile));
    await symlink("../example-app/appstream.json", join(mediaDirectory, mediaFile));

    await expectReadError(root, "must be a regular file");
  });

  test("rejects oversized manifests", async () => {
    const root = await temporaryDirectory();
    const { source } = await writeApp(root);

    await writeFile(source, " ".repeat(64 * 1024 + 1));

    await expectReadError(root, "file is too large");
  });

  test("rejects missing and unreferenced media", async () => {
    const missingRoot = await temporaryDirectory();
    const unreferencedRoot = await temporaryDirectory();
    const { mediaDirectory: missingDirectory, mediaFile } = await writeApp(missingRoot);
    const { mediaDirectory: unreferencedDirectory } = await writeApp(unreferencedRoot);
    const unreferenced = `${"b".repeat(64)}.webp`;

    await rm(join(missingDirectory, mediaFile));
    await writeFile(join(unreferencedDirectory, unreferenced), "not inspected");

    await expectReadError(missingRoot, `Missing generated media file: ${mediaFile}`);
    await expectReadError(unreferencedRoot, `Unreferenced generated media file: ${unreferenced}`);
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
