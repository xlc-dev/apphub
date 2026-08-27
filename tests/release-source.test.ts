import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeDate, selectCurrent, type SourceRelease } from "#scripts/releases/model";
import type { ReleaseLock } from "#catalog/schema";

const releases: SourceRelease[] = [
  {
    version: "3.0",
    publishedAt: "2026-03-01T00:00:00Z",
    page: "https://example.org/3.0",
    artifacts: [],
  },
  {
    version: "2.0",
    publishedAt: "2026-02-01T00:00:00Z",
    page: "https://example.org/2.0",
    artifacts: [],
  },
  {
    version: "1.0",
    publishedAt: "2026-01-01T00:00:00Z",
    page: "https://example.org/1.0",
    artifacts: [],
  },
];

function lock(version?: string, publishedAt = "2026-01-01T00:00:00Z"): ReleaseLock {
  return {
    appId: "org.example.App",
    releases: version
      ? [
          {
            version,
            publishedAt,
            page: "https://example.org/recorded",
            artifacts: [],
          },
        ]
      : [],
  };
}

test("normalizes timestamps with offsets", () => {
  assert.equal(normalizeDate("2026-08-20T10:49:50+02:00"), "2026-08-20T08:49:50.000Z");
  assert.equal(normalizeDate("2026-08-20T08:49:50Z"), "2026-08-20T08:49:50Z");
});

describe("current releases", () => {
  test("selects only the latest release for a new app", () => {
    assert.deepEqual(selectCurrent(releases, lock(), "fixture"), [releases[0]!]);
  });

  test("keeps only the latest release after an update", () => {
    assert.deepEqual(selectCurrent(releases, lock("2.0"), "fixture"), [releases[0]!]);
  });

  test("rejects invalid release histories", () => {
    assert.throws(
      () => selectCurrent([releases[0]!, releases[0]!], lock(), "fixture"),
      /versions are not unique/
    );
    assert.throws(
      () => selectCurrent([...releases].reverse(), lock(), "fixture"),
      /not ordered newest first/
    );
    assert.throws(
      () => selectCurrent(releases, lock("missing", "2026-03-01T00:00:00Z"), "fixture"),
      /recorded current release is no longer available/
    );
  });
});
