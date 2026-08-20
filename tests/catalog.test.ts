import { describe, expect, test } from "bun:test";
import {
  globRegex,
  hashDownload,
  matchesArchitecture,
  selectAssets,
  sha256,
  validateImage,
} from "@catalog/core";
import { appSchema, releaseLockSchema, type App } from "@catalog/schema";
import sharp from "sharp";

const app: App = {
  id: "org.example.App",
  name: "Example",
  summary: "An example app",
  description: "An example application for tests.",
  projectLicense: "MIT",
  developer: { name: "Example Developers" },
  homepage: "https://example.org/",
  addedAt: "2026-08-20",
  categories: ["Utility"],
  source: "official",
  releaseSource: { type: "github", repository: "example/app" },
  screenshots: [{ file: "screenshot-1.png", caption: "Main window" }],
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
    expect(appSchema.parse(app)).toEqual(app);
  });

  test("requires official or community provenance", () => {
    expect(appSchema.parse({ ...app, source: "community" }).source).toBe("community");
    expect(() => appSchema.parse({ ...app, source: undefined })).toThrow();
    expect(() => appSchema.parse({ ...app, source: "unknown" })).toThrow();
  });

  test("rejects unknown manifest fields", () => {
    expect(() => appSchema.parse({ ...app, unknown: true })).toThrow();
  });

  test("requires HTTPS URLs", () => {
    expect(() => appSchema.parse({ ...app, homepage: "http://example.org" })).toThrow(
      "Must use HTTPS"
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
      expect(() => appSchema.parse({ ...app, [field]: undefined })).toThrow();
    }
  });

  test("uses registered category identifiers", () => {
    expect(appSchema.parse({ ...app, categories: ["Graphics", "2DGraphics"] }).categories).toEqual(
      ["Graphics", "2DGraphics"]
    );
    expect(() => appSchema.parse({ ...app, categories: ["Audio & Video"] })).toThrow();
    expect(() => appSchema.parse({ ...app, categories: ["MadeUpCategory"] })).toThrow();
    expect(() => appSchema.parse({ ...app, categories: ["Utility", "Utility"] })).toThrow(
      "Categories must be unique"
    );
  });

  test("requires a main category", () => {
    expect(() => appSchema.parse({ ...app, categories: ["TextEditor"] })).toThrow(
      "At least one main category is required"
    );
    expect(appSchema.parse({ ...app, categories: ["Utility", "TextEditor"] }).categories).toEqual([
      "Utility",
      "TextEditor",
    ]);
  });

  test("requires an SPDX project license expression", () => {
    expect(appSchema.parse({ ...app, projectLicense: "MIT OR Apache-2.0" }).projectLicense).toBe(
      "MIT OR Apache-2.0"
    );
    expect(() => appSchema.parse({ ...app, projectLicense: "MadeUpLicense" })).toThrow(
      "Must be a valid SPDX license expression"
    );
  });

  test("accepts MIME types and URI handlers", () => {
    expect(
      appSchema.parse({
        ...app,
        mimeTypes: ["video/mp4", "x-scheme-handler/magnet"],
      }).mimeTypes
    ).toEqual(["video/mp4", "x-scheme-handler/magnet"]);
    expect(() => appSchema.parse({ ...app, mimeTypes: ["not-a-mime-type"] })).toThrow();
  });

  test("rejects duplicate keywords", () => {
    expect(() => appSchema.parse({ ...app, keywords: ["example", "Example"] })).toThrow(
      "Keywords must be unique"
    );
  });

  test("limits contributor-controlled text", () => {
    expect(() => appSchema.parse({ ...app, summary: "x".repeat(201) })).toThrow();
    expect(() =>
      appSchema.parse({
        ...app,
        screenshots: [{ file: "screenshot-1.png", caption: "x".repeat(201) }],
      })
    ).toThrow();
  });

  test("requires at least one screenshot", () => {
    expect(() => appSchema.parse({ ...app, screenshots: [] })).toThrow();
  });

  test("requires screenshot descriptions", () => {
    expect(() =>
      appSchema.parse({ ...app, screenshots: [{ file: "screenshot-1.png" }] })
    ).toThrow();
  });

  test("rejects screenshot paths", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        screenshots: [{ file: "../screenshot.png", caption: "Main window" }],
      })
    ).toThrow();
  });

  test("rejects duplicate screenshots", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        screenshots: [
          { file: "screenshot-1.png", caption: "Main window" },
          { file: "screenshot-1.png", caption: "Main window" },
        ],
      })
    ).toThrow("Screenshot files must be unique");
  });

  test("accepts directly maintained releases", () => {
    expect(appSchema.parse({ ...app, releaseSource: { type: "direct" } }).releaseSource).toEqual({
      type: "direct",
    });
  });

  test("accepts structured release feeds", () => {
    expect(
      appSchema.parse({
        ...app,
        releaseSource: { type: "feed", url: "https://example.org/releases.json" },
      }).releaseSource
    ).toEqual({ type: "feed", url: "https://example.org/releases.json" });
  });

  test("requires a complete sandbox policy", () => {
    expect(() => appSchema.parse({ ...app, sandbox: undefined })).toThrow();
    expect(() =>
      appSchema.parse({ ...app, sandbox: { ...app.sandbox, network: undefined } })
    ).toThrow();
  });

  test("rejects duplicate sandbox permissions", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        sandbox: {
          ...app.sandbox,
          filesystem: [
            { location: "documents", access: "read-only" },
            { location: "documents", access: "read-write" },
          ],
        },
      })
    ).toThrow("Filesystem locations must be unique");
  });

  test("requires exact D-Bus names", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        sandbox: {
          ...app.sandbox,
          sessionBus: [{ name: "org.example.*", access: "talk" }],
        },
      })
    ).toThrow();
  });

  test("rejects unsafe asset patterns", () => {
    expect(() =>
      appSchema.parse({ ...app, assets: { x86_64: "downloads/Example.AppImage" } })
    ).toThrow("filename pattern");
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

    expect(() => releaseLockSchema.parse({ appId: app.id, releases: [older, release] })).toThrow(
      "Releases must be ordered newest first"
    );
  });

  test("rejects duplicate release versions", () => {
    expect(() => releaseLockSchema.parse({ appId: app.id, releases: [release, release] })).toThrow(
      "Release versions must be unique"
    );
  });

  test("rejects duplicate architectures in a release", () => {
    const duplicate = {
      ...release,
      artifacts: [release.artifacts[0], { ...release.artifacts[0], name: "Other.AppImage" }],
    };

    expect(() => releaseLockSchema.parse({ appId: app.id, releases: [duplicate] })).toThrow(
      "Release architectures must be unique"
    );
  });
});

describe("asset matching", () => {
  test("glob patterns are anchored", () => {
    const pattern = globRegex("Example-*-x86_64.AppImage");

    expect(pattern.test("Example-1-x86_64.AppImage")).toBe(true);
    expect(pattern.test("prefix-Example-1-x86_64.AppImage")).toBe(false);
  });

  test("architectures require filename boundaries", () => {
    expect(matchesArchitecture("Example-x86_64.AppImage", "x86_64")).toBe(true);
    expect(matchesArchitecture("Example-amd64.AppImage", "x86_64")).toBe(true);
    expect(matchesArchitecture("Example-notarm64.AppImage", "aarch64")).toBe(false);
    expect(matchesArchitecture("Example-arm64.AppImage.zsync", "aarch64")).toBe(false);
  });

  test("supports single-architecture releases", () => {
    expect(selectAssets(app, [{ name: "Example-x86_64.AppImage" }])).toEqual([
      { architecture: "x86_64", asset: { name: "Example-x86_64.AppImage" } },
    ]);
  });

  test("supports additional and custom architectures", () => {
    expect(
      selectAssets(
        {
          ...app,
          assets: { riscv64: "Example-riscv64.AppImage", loongarch64: "*-la64.AppImage" },
        },
        [{ name: "Example-riscv64.AppImage" }, { name: "Example-la64.AppImage" }]
      ).map(({ architecture }) => architecture)
    ).toEqual(["loongarch64", "riscv64"]);
  });

  test("ambiguous assets fail closed", () => {
    expect(() =>
      selectAssets(app, [
        { name: "Example-1-x86_64.AppImage" },
        { name: "Example-2-x86_64.AppImage" },
      ])
    ).toThrow("expected one x86_64 asset, found 2");
  });

  test("does not select one asset for multiple architectures", () => {
    expect(() =>
      selectAssets(
        { ...app, assets: { x86_64: "Example.AppImage", aarch64: "Example.AppImage" } },
        [{ name: "Example.AppImage" }]
      )
    ).toThrow("selected the same asset");
  });
});

describe("download hashing", () => {
  const url = "data:application/octet-stream;base64,YXBwaHVi";

  test("hashes an exact-size download", async () => {
    expect(await hashDownload({ name: "fixture", url, size: 6 })).toEqual({
      size: 6,
      sha256: sha256(Buffer.from("apphub")),
    });
  });

  test("rejects downloads with a different published size", async () => {
    expect(await errorMessage(hashDownload({ name: "fixture", url, size: 7 }))).toContain(
      "differs from published size"
    );
  });

  test("stops downloads that exceed their published size", async () => {
    expect(await errorMessage(hashDownload({ name: "fixture", url, size: 5 }))).toContain(
      "exceeds published size"
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

    for (const [file, data] of images) await validateImage(data, file, app.id, { icon: true });
  });

  test("rejects non-square icons", async () => {
    const data = await image(128, 256).png().toBuffer();

    expect(await errorMessage(validateImage(data, "icon.png", app.id, { icon: true }))).toContain(
      "icon must be square"
    );
  });

  test("rejects corrupt and truncated images", async () => {
    const valid = await image().png().toBuffer();

    expect(
      await errorMessage(validateImage(Buffer.from("not an image"), "icon.png", app.id))
    ).toContain(app.id);
    expect(await errorMessage(validateImage(valid.subarray(0, 24), "icon.png", app.id))).toContain(
      app.id
    );
  });

  test("rejects icons outside the supported dimensions", async () => {
    expect(
      await errorMessage(
        validateImage(await image(64).png().toBuffer(), "icon.png", app.id, { icon: true })
      )
    ).toContain("between 128 and 1024 pixels");
    expect(
      await errorMessage(
        validateImage(await image(2048).png().toBuffer(), "icon.png", app.id, { icon: true })
      )
    ).toContain("between 128 and 1024 pixels");
  });

  test("rejects excessive screenshot dimensions", async () => {
    const data = await image(8193, 1).png().toBuffer();

    expect(await errorMessage(validateImage(data, "screenshot-1.png", app.id))).toContain(
      "must not exceed 8192 pixels"
    );
  });

  test("rejects images that do not match their extension", async () => {
    const data = await image().png().toBuffer();

    expect(await errorMessage(validateImage(data, "screenshot-1.jpg", app.id))).toContain(
      "does not match its image format"
    );
  });

  test("rejects unsupported formats", async () => {
    const data = await image().gif().toBuffer();

    expect(await errorMessage(validateImage(data, "screenshot-1.gif", app.id))).toContain(
      "unsupported image format"
    );
  });
});
