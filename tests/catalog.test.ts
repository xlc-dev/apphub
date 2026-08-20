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
  source: "official",
  releaseSource: { type: "github", repository: "example/app" },
  screenshots: [{ file: "screenshot-1.png", caption: "Main window" }],
  security: { isolation: "none", expectedAccess: [] },
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
  test("accepts the minimal developer manifest", () => {
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

  test("rejects duplicate access declarations", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        security: { isolation: "none", expectedAccess: ["network", "network"] },
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
