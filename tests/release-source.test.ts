import { describe, expect, test } from "bun:test";
import { normalizeDate, selectCurrent, type SourceRelease } from "../scripts/releases/model";
import type { ReleaseLock } from "@catalog/core";

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

function lock(version?: string): ReleaseLock {
  return {
    appId: "org.example.App",
    releases: version
      ? [
          {
            version,
            publishedAt: "2026-01-01T00:00:00Z",
            page: "https://example.org/recorded",
            artifacts: [],
          },
        ]
      : [],
  };
}

test("normalizes timestamps with offsets", () => {
  expect(normalizeDate("2026-08-20T10:49:50+02:00")).toBe("2026-08-20T08:49:50.000Z");
  expect(normalizeDate("2026-08-20T08:49:50Z")).toBe("2026-08-20T08:49:50Z");
});

describe("current releases", () => {
  test("selects only the latest release for a new app", () => {
    expect(selectCurrent(releases, lock(), "fixture")).toEqual([releases[0]!]);
  });

  test("selects releases through the recorded version", () => {
    expect(selectCurrent(releases, lock("2.0"), "fixture")).toEqual(releases.slice(0, 2));
  });

  test("rejects invalid release histories", () => {
    expect(() => selectCurrent([releases[0]!, releases[0]!], lock(), "fixture")).toThrow(
      "versions are not unique"
    );
    expect(() => selectCurrent([...releases].reverse(), lock(), "fixture")).toThrow(
      "not ordered newest first"
    );
    expect(() => selectCurrent(releases, lock("missing"), "fixture")).toThrow(
      "recorded release not found"
    );
  });
});
