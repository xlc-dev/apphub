import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { featuredApps } from "#lib/featured-apps";

const week = new Date("2026-08-24T12:00:00Z");

function app(id: string, category: string, options: { releases?: number } = {}) {
  return {
    id,
    categories: [category],
    screenshots: [{}],
    releases: Array.from({ length: options.releases ?? 1 }, () => ({})),
  };
}

describe("featured apps", () => {
  test("is stable within an ISO week", () => {
    const apps = [app("a", "Audio"), app("b", "Game"), app("c", "Utility"), app("d", "Video")];

    assert.deepEqual(
      featuredApps(apps, week),
      featuredApps(apps, new Date("2026-08-30T23:59:59Z"))
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
    const current = featuredApps(apps, week);
    const later = featuredApps(apps, new Date("2026-09-07T12:00:00Z"));

    assert.equal(current.length, 3);
    assert.equal(new Set(current.map(({ categories }) => categories[0])).size, 3);
    assert.notDeepEqual(current, later);
  });

  test("excludes apps without releases", () => {
    const available = app("available", "Utility");

    assert.deepEqual(featuredApps([available, app("empty", "Audio", { releases: 0 })], week), [
      available,
    ]);
  });
});
