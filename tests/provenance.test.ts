import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mergeReleaseSource, reconcileRelease } from "#catalog/provenance";
import { originSchema, type CatalogProvenance, type ReleaseLock } from "#catalog/schema";

const releaseSource = {
  provider: "github",
  configuredUrl: "https://github.com/example/app",
  sourceUrl: "https://github.com/example/app",
  projectId: "100",
  ownerId: "10",
} satisfies CatalogProvenance["releaseSource"];

const release: ReleaseLock["releases"][number] = {
  version: "1.0",
  publishedAt: "2026-08-25T12:00:00Z",
  page: "https://github.com/example/app/releases/tag/1.0",
  releaseId: "1000",
  artifacts: [
    {
      architecture: "x86_64",
      name: "App-x86_64.AppImage",
      url: "https://github.com/example/app/releases/download/1.0/App-x86_64.AppImage",
      size: 100,
      sha256: "a".repeat(64),
      checksumEvidence: {
        sourceUrl: "https://github.com/example/app/releases/tag/1.0",
      },
      assetId: "10000",
    },
  ],
};

describe("origin review", () => {
  test("requires evidence for an upstream origin", () => {
    assert.equal(
      originSchema.safeParse({
        type: "upstream",
      }).success,
      false
    );
  });

  test("accepts a third-party origin without pretending it is verified", () => {
    assert.equal(originSchema.safeParse({ type: "third-party" }).success, true);
  });
});

describe("release source identity", () => {
  test("allows a repository rename when durable identities remain stable", () => {
    const merged = mergeReleaseSource(releaseSource, {
      provider: "github",
      projectId: "100",
      ownerId: "10",
      sourceUrl: "https://github.com/example/renamed-app",
    });

    assert.equal(merged.sourceUrl, "https://github.com/example/renamed-app");
  });

  test("rejects a different provider project", () => {
    assert.throws(
      () =>
        mergeReleaseSource(releaseSource, {
          provider: "github",
          projectId: "200",
          ownerId: "10",
          sourceUrl: releaseSource.sourceUrl,
        }),
      /project identity changed/
    );
  });

  test("rejects a repository transfer", () => {
    assert.throws(
      () =>
        mergeReleaseSource(releaseSource, {
          provider: "github",
          projectId: "100",
          ownerId: "20",
          sourceUrl: "https://github.com/new-owner/app",
        }),
      /ownership changed/
    );
  });

  test("rejects a feed URL change without a durable identity", () => {
    const feed = {
      ...releaseSource,
      provider: "feed",
      configuredUrl: "https://example.com/releases.json",
      sourceUrl: "https://example.com/releases.json",
      projectId: undefined,
      ownerId: undefined,
    } satisfies CatalogProvenance["releaseSource"];

    assert.throws(
      () =>
        mergeReleaseSource(feed, {
          provider: "feed",
          sourceUrl: "https://other.example/releases.json",
        }),
      /URL changed without durable provider identity/
    );
  });

  test("allows release URLs to follow a validated source rename", () => {
    const withoutReleaseId = structuredClone(release);

    delete withoutReleaseId.releaseId;
    const renamed = structuredClone(withoutReleaseId);

    renamed.page = "https://gitlab.example/project/-/releases/1.0";

    assert.equal(reconcileRelease(withoutReleaseId, renamed).page, renamed.page);
  });
});

describe("recorded releases", () => {
  test("allows canonical URLs to follow a repository rename", () => {
    const renamed = structuredClone(release);
    const artifact = renamed.artifacts[0];

    assert.ok(artifact);

    renamed.page = "https://github.com/example/renamed-app/releases/tag/1.0";
    artifact.url =
      "https://github.com/example/renamed-app/releases/download/1.0/App-x86_64.AppImage";
    artifact.checksumEvidence = { sourceUrl: renamed.page };

    assert.deepEqual(reconcileRelease(release, renamed), renamed);
  });

  test("rejects changed bytes at the same durable asset identity", () => {
    const changed = structuredClone(release);
    const artifact = changed.artifacts[0];

    assert.ok(artifact);

    artifact.sha256 = "b".repeat(64);

    assert.throws(() => reconcileRelease(release, changed), /published artifact changed/);
  });

  test("retains checksum evidence when a provider stops returning it", () => {
    const changed = structuredClone(release);
    const artifact = changed.artifacts[0];

    assert.ok(artifact);

    delete artifact.checksumEvidence;

    assert.deepEqual(
      reconcileRelease(release, changed).artifacts[0]?.checksumEvidence,
      release.artifacts[0]?.checksumEvidence
    );
  });
});
