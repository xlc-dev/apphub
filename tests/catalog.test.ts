import { describe, expect, test } from "bun:test";
import {
  globRegex,
  hashDownload,
  matchesArchitecture,
  selectAssets,
  sha256,
  validatePng,
  validateScreenshot,
} from "@catalog/core";
import { appSchema, releaseLockSchema, type App } from "@catalog/schema";

const app: App = {
  id: "org.example.App",
  name: "Example",
  summary: "An example app",
  releaseSource: { type: "github", repository: "example/app" },
  screenshots: [{ file: "screenshot-1.png", caption: "Main window" }],
  security: { isolation: "none", expectedAccess: [] },
};

function png(width = 128, height = width) {
  const data = Buffer.alloc(24);

  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);

  return data;
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

  test("rejects unknown manifest fields", () => {
    expect(() => appSchema.parse({ ...app, unknown: true })).toThrow();
  });

  test("requires at least one screenshot", () => {
    expect(() => appSchema.parse({ ...app, screenshots: [] })).toThrow();
  });

  test("rejects screenshot paths", () => {
    expect(() =>
      appSchema.parse({ ...app, screenshots: [{ file: "../screenshot.png" }] })
    ).toThrow();
  });

  test("rejects duplicate screenshots", () => {
    expect(() =>
      appSchema.parse({
        ...app,
        screenshots: [{ file: "screenshot-1.png" }, { file: "screenshot-1.png" }],
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

describe("PNG validation", () => {
  test("accepts a square PNG header", () => {
    expect(() => validatePng(png(), app.id)).not.toThrow();
  });

  test("rejects non-square icons", () => {
    expect(() => validatePng(png(128, 256), app.id)).toThrow("icon must be square");
  });

  test("rejects non-PNG files", () => {
    expect(() => validatePng(Buffer.from("not a PNG"), app.id)).toThrow("icon is not a PNG");
  });

  test("rejects icons outside the supported dimensions", () => {
    expect(() => validatePng(png(64), app.id)).toThrow("between 128 and 1024 pixels");
    expect(() => validatePng(png(2048), app.id)).toThrow("between 128 and 1024 pixels");
  });
});

describe("screenshot validation", () => {
  test("accepts images that match their extension", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const webp = Buffer.from("RIFF0000WEBP");

    expect(() => validateScreenshot(png(), "screenshot-1.png", app.id)).not.toThrow();
    expect(() => validateScreenshot(jpeg, "screenshot-1.jpg", app.id)).not.toThrow();
    expect(() => validateScreenshot(jpeg, "screenshot-1.jpeg", app.id)).not.toThrow();
    expect(() => validateScreenshot(webp, "screenshot-1.webp", app.id)).not.toThrow();
  });

  test("rejects images that do not match their extension", () => {
    expect(() =>
      validateScreenshot(Buffer.from("not an image"), "screenshot-1.png", app.id)
    ).toThrow("does not match its image format");
    expect(() => validateScreenshot(png(), "screenshot-1.jpg", app.id)).toThrow(
      "does not match its image format"
    );
  });
});
