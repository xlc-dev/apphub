import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  globRegex,
  hashDownload,
  matchesArchitecture,
  selectAssets,
  sha256,
  validateImage,
} from "#catalog/core";
import { appSchema, releaseLockSchema, type App } from "#catalog/schema";
import sharp from "sharp";

const app: App = {
  id: "org.example.App",
  name: "Example",
  summary: "An example app",
  description: [
    {
      type: "paragraph",
      content: [{ type: "text", value: "An example application for tests." }],
    },
  ],
  projectLicense: "MIT",
  developer: { name: "Example Developers" },
  homepage: "https://example.org/",
  addedAt: "2026-08-20",
  categories: ["Utility"],
  source: "official",
  releaseSource: { type: "github", repository: "example/app" },
  icon: { source: "https://example.org/icon.png" },
  screenshots: [
    {
      file: "screenshot-1.png",
      caption: "Main window",
      source: "https://example.org/screenshot.png",
    },
  ],
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

function image(width = 128, height = width) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  });
}

async function errorMessage(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error("Expected promise to reject");
}

describe("catalog schema", () => {
  test("accepts a complete application manifest", () => {
    assert.deepEqual(appSchema.parse(app), app);
  });

  test("requires official or community provenance", () => {
    assert.equal(appSchema.parse({ ...app, source: "community" }).source, "community");
    assert.throws(() => appSchema.parse({ ...app, source: undefined }));
    assert.throws(() => appSchema.parse({ ...app, source: "unknown" }));
  });

  test("rejects unknown manifest fields", () => {
    assert.throws(() => appSchema.parse({ ...app, unknown: true }));
  });

  test("requires HTTPS URLs", () => {
    assert.throws(
      () => appSchema.parse({ ...app, homepage: "http://example.org" }),
      /Must use HTTPS/
    );
  });

  test("requires core AppStream metadata", () => {
    for (const field of [
      "description",
      "projectLicense",
      "developer",
      "homepage",
      "addedAt",
      "categories",
    ] as const) {
      assert.throws(() => appSchema.parse({ ...app, [field]: undefined }));
    }
  });

  test("uses registered category identifiers", () => {
    assert.deepEqual(
      appSchema.parse({ ...app, categories: ["Graphics", "2DGraphics"] }).categories,
      ["Graphics", "2DGraphics"]
    );
    assert.throws(() => appSchema.parse({ ...app, categories: ["Audio & Video"] }));
    assert.throws(() => appSchema.parse({ ...app, categories: ["MadeUpCategory"] }));
    assert.throws(
      () => appSchema.parse({ ...app, categories: ["Utility", "Utility"] }),
      /Categories must be unique/
    );
  });

  test("requires a main category", () => {
    assert.throws(
      () => appSchema.parse({ ...app, categories: ["TextEditor"] }),
      /At least one main category is required/
    );
    assert.deepEqual(
      appSchema.parse({ ...app, categories: ["Utility", "TextEditor"] }).categories,
      ["Utility", "TextEditor"]
    );
  });

  test("requires an SPDX project license expression", () => {
    assert.equal(
      appSchema.parse({ ...app, projectLicense: "MIT OR Apache-2.0" }).projectLicense,
      "MIT OR Apache-2.0"
    );
    assert.throws(
      () => appSchema.parse({ ...app, projectLicense: "MadeUpLicense" }),
      /Must be a valid SPDX license expression/
    );
  });

  test("accepts MIME types and URI handlers", () => {
    assert.deepEqual(
      appSchema.parse({
        ...app,
        mimeTypes: ["video/mp4", "x-scheme-handler/magnet"],
      }).mimeTypes,
      ["video/mp4", "x-scheme-handler/magnet"]
    );
    assert.throws(() => appSchema.parse({ ...app, mimeTypes: ["not-a-mime-type"] }));
  });

  test("rejects duplicate keywords", () => {
    assert.throws(
      () => appSchema.parse({ ...app, keywords: ["example", "Example"] }),
      /Keywords must be unique/
    );
  });

  test("limits contributor-controlled text", () => {
    assert.throws(() => appSchema.parse({ ...app, summary: "x".repeat(201) }));
    assert.throws(() =>
      appSchema.parse({
        ...app,
        screenshots: [{ ...app.screenshots[0], caption: "x".repeat(201) }],
      })
    );
  });

  test("requires at least one screenshot", () => {
    assert.throws(() => appSchema.parse({ ...app, screenshots: [] }));
  });

  test("requires screenshot descriptions", () => {
    assert.throws(() =>
      appSchema.parse({ ...app, screenshots: [{ ...app.screenshots[0], caption: undefined }] })
    );
  });

  test("rejects screenshot paths", () => {
    assert.throws(() =>
      appSchema.parse({
        ...app,
        screenshots: [{ ...app.screenshots[0], file: "../screenshot.png" }],
      })
    );
  });

  test("rejects duplicate screenshots", () => {
    assert.throws(
      () =>
        appSchema.parse({
          ...app,
          screenshots: [app.screenshots[0], app.screenshots[0]],
        }),
      /Screenshot files must be unique/
    );
  });

  test("accepts GitLab and Codeberg release sources", () => {
    assert.deepEqual(
      appSchema.parse({
        ...app,
        releaseSource: { type: "gitlab", repository: "example/tools/app" },
      }).releaseSource,
      { type: "gitlab", repository: "example/tools/app" }
    );
    assert.deepEqual(
      appSchema.parse({
        ...app,
        releaseSource: { type: "codeberg", repository: "example/app" },
      }).releaseSource,
      { type: "codeberg", repository: "example/app" }
    );
  });

  test("accepts structured release feeds", () => {
    assert.deepEqual(
      appSchema.parse({
        ...app,
        releaseSource: { type: "feed", url: "https://example.org/releases.json" },
      }).releaseSource,
      { type: "feed", url: "https://example.org/releases.json" }
    );
  });

  test("requires a complete sandbox policy", () => {
    assert.throws(() => appSchema.parse({ ...app, sandbox: undefined }));
    assert.throws(() =>
      appSchema.parse({ ...app, sandbox: { ...app.sandbox, network: undefined } })
    );
  });

  test("rejects duplicate sandbox permissions", () => {
    assert.throws(
      () =>
        appSchema.parse({
          ...app,
          sandbox: {
            ...app.sandbox,
            filesystem: [
              { location: "documents", access: "read-only" },
              { location: "documents", access: "read-write" },
            ],
          },
        }),
      /Filesystem locations must be unique/
    );
  });

  test("requires exact D-Bus names", () => {
    assert.throws(() =>
      appSchema.parse({
        ...app,
        sandbox: {
          ...app.sandbox,
          sessionBus: [{ name: "org.example.*", access: "talk" }],
        },
      })
    );
  });

  test("rejects unsafe asset patterns", () => {
    assert.throws(
      () => appSchema.parse({ ...app, assets: { x86_64: "downloads/Example.AppImage" } }),
      /filename pattern/
    );
  });
});

describe("release lock schema", () => {
  const release = {
    version: "2.0",
    publishedAt: "2026-08-02T00:00:00Z",
    page: "https://example.org/releases/2.0",
    artifacts: [
      {
        architecture: "x86_64" as const,
        name: "Example-x86_64.AppImage",
        url: "https://example.org/Example-x86_64.AppImage",
        size: 1,
        sha256: "0".repeat(64),
      },
    ],
  };

  test("requires releases newest first", () => {
    const older = {
      ...release,
      version: "1.0",
      publishedAt: "2026-08-01T00:00:00Z",
      page: "https://example.org/releases/1.0",
    };

    assert.throws(
      () => releaseLockSchema.parse({ appId: app.id, releases: [older, release] }),
      /Releases must be ordered newest first/
    );
  });

  test("rejects duplicate release versions", () => {
    assert.throws(
      () => releaseLockSchema.parse({ appId: app.id, releases: [release, release] }),
      /Release versions must be unique/
    );
  });

  test("rejects duplicate architectures in a release", () => {
    const duplicate = {
      ...release,
      artifacts: [release.artifacts[0], { ...release.artifacts[0], name: "Other.AppImage" }],
    };

    assert.throws(
      () => releaseLockSchema.parse({ appId: app.id, releases: [duplicate] }),
      /Release architectures must be unique/
    );
  });
});

describe("asset matching", () => {
  test("glob patterns are anchored", () => {
    const pattern = globRegex("Example-*-x86_64.AppImage");

    assert.equal(pattern.test("Example-1-x86_64.AppImage"), true);
    assert.equal(pattern.test("prefix-Example-1-x86_64.AppImage"), false);
  });

  test("architectures require filename boundaries", () => {
    assert.equal(matchesArchitecture("Example-x86_64.AppImage", "x86_64"), true);
    assert.equal(matchesArchitecture("Example-amd64.AppImage", "x86_64"), true);
    assert.equal(matchesArchitecture("Example-notarm64.AppImage", "aarch64"), false);
    assert.equal(matchesArchitecture("Example-arm64.AppImage.zsync", "aarch64"), false);
  });

  test("supports single-architecture releases", () => {
    assert.deepEqual(selectAssets(app, [{ name: "Example-x86_64.AppImage" }]), [
      { architecture: "x86_64", asset: { name: "Example-x86_64.AppImage" } },
    ]);
  });

  test("supports additional and custom architectures", () => {
    assert.deepEqual(
      selectAssets(
        {
          ...app,
          assets: { riscv64: "Example-riscv64.AppImage", loongarch64: "*-la64.AppImage" },
        },
        [{ name: "Example-riscv64.AppImage" }, { name: "Example-la64.AppImage" }]
      ).map(({ architecture }) => architecture),
      ["loongarch64", "riscv64"]
    );
  });

  test("ambiguous assets fail closed", () => {
    assert.throws(
      () =>
        selectAssets(app, [
          { name: "Example-1-x86_64.AppImage" },
          { name: "Example-2-x86_64.AppImage" },
        ]),
      /expected one x86_64 asset, found 2/
    );
  });

  test("does not select one asset for multiple architectures", () => {
    assert.throws(
      () =>
        selectAssets(
          { ...app, assets: { x86_64: "Example.AppImage", aarch64: "Example.AppImage" } },
          [{ name: "Example.AppImage" }]
        ),
      /selected the same asset/
    );
  });
});

describe("download hashing", () => {
  const url = "https://example.org/fixture.AppImage";
  const fetcher = () => Promise.resolve(new Response("apphub"));

  test("hashes an exact-size download", async () => {
    assert.deepEqual(await hashDownload({ name: "fixture", url, size: 6 }, { fetcher }), {
      size: 6,
      sha256: sha256(Buffer.from("apphub")),
    });
  });

  test("measures a download without a published size", async () => {
    assert.deepEqual(await hashDownload({ name: "fixture", url }, { fetcher }), {
      size: 6,
      sha256: sha256(Buffer.from("apphub")),
    });
  });

  test("rejects downloads with a different published size", async () => {
    assert.match(
      await errorMessage(hashDownload({ name: "fixture", url, size: 7 }, { fetcher })),
      /differs from published size/
    );
  });

  test("stops downloads that exceed their published size", async () => {
    assert.match(
      await errorMessage(hashDownload({ name: "fixture", url, size: 5 }, { fetcher })),
      /exceeds published size/
    );
  });
});

describe("image validation", () => {
  test("accepts supported web image formats", async () => {
    const images = [
      ["icon.png", await image().png().toBuffer()],
      ["icon.jpg", await image().jpeg().toBuffer()],
      ["icon.webp", await image().webp().toBuffer()],
      ["icon.avif", await image().avif().toBuffer()],
    ] as const;

    for (const [file, data] of images) {
      await validateImage(data, file, app.id, { icon: true });
    }
  });

  test("rejects non-square icons", async () => {
    const data = await image(128, 256).png().toBuffer();

    assert.match(
      await errorMessage(validateImage(data, "icon.png", app.id, { icon: true })),
      /icon must be square/
    );
  });

  test("rejects corrupt and truncated images", async () => {
    const valid = await image().png().toBuffer();

    assert.match(
      await errorMessage(validateImage(Buffer.from("not an image"), "icon.png", app.id)),
      new RegExp(app.id)
    );
    assert.match(
      await errorMessage(validateImage(valid.subarray(0, 24), "icon.png", app.id)),
      new RegExp(app.id)
    );
  });

  test("rejects icons outside the supported dimensions", async () => {
    assert.match(
      await errorMessage(
        validateImage(await image(64).png().toBuffer(), "icon.png", app.id, { icon: true })
      ),
      /between 128 and 1024 pixels/
    );
    assert.match(
      await errorMessage(
        validateImage(await image(2048).png().toBuffer(), "icon.png", app.id, { icon: true })
      ),
      /between 128 and 1024 pixels/
    );
  });

  test("rejects excessive screenshot dimensions", async () => {
    const data = await image(8193, 1).png().toBuffer();

    assert.match(
      await errorMessage(validateImage(data, "screenshot-1.png", app.id)),
      /must not exceed 8192 pixels/
    );
  });

  test("rejects images that do not match their extension", async () => {
    const data = await image().png().toBuffer();

    assert.match(
      await errorMessage(validateImage(data, "screenshot-1.jpg", app.id)),
      /does not match its image format/
    );
  });

  test("rejects unsupported formats", async () => {
    const data = await image().gif().toBuffer();

    assert.match(
      await errorMessage(validateImage(data, "screenshot-1.gif", app.id)),
      /unsupported image format/
    );
  });
});
