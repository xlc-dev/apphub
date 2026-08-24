import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { discoverApps } from "#lib/discover";

const week = new Date("2026-08-24T12:00:00Z");

function app(
  id: string,
  category: string,
  options: { deprecated?: boolean; releases?: number } = {}
) {
  return {
    id,
    categories: [category],
    screenshots: [{}],
    releases: Array.from({ length: options.releases ?? 1 }, () => ({})),
    ...(options.deprecated ? { deprecated: true } : {}),
  };
}

describe("discover apps", () => {
  test("is stable within an ISO week", () => {
    const apps = [app("a", "Audio"), app("b", "Game"), app("c", "Utility"), app("d", "Video")];

    assert.deepEqual(
      discoverApps(apps, week),
      discoverApps(apps, new Date("2026-08-30T23:59:59Z"))
    );
  });

  test("rotates the selection and prefers distinct categories", () => {
    const apps = [
      app("a", "Audio"),
      app("b", "Audio"),
      app("c", "Game"),
      app("d", "Utility"),
      app("e", "Video"),
    ];
    const current = discoverApps(apps, week);
    const later = discoverApps(apps, new Date("2026-09-07T12:00:00Z"));

    assert.equal(current.length, 3);
    assert.equal(new Set(current.map(({ categories }) => categories[0])).size, 3);
    assert.notDeepEqual(current, later);
  });

  test("excludes deprecated apps and apps without releases", () => {
    const available = app("available", "Utility");

    assert.deepEqual(
      discoverApps(
        [
          available,
          app("deprecated", "Game", { deprecated: true }),
          app("empty", "Audio", { releases: 0 }),
        ],
        week
      ),
      [available]
    );
  });
});
