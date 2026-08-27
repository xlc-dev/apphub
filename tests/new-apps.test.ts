import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newApps } from "#lib/new-apps";

const now = new Date("2026-08-19T12:00:00Z");

function app(name: string, addedAt: string) {
  return { name, addedAt };
}

describe("new apps", () => {
  test("uses the catalog addition date", () => {
    const oldApp = app("Old", "2026-01-01");
    const newApp = app("New", "2026-08-10");

    assert.deepEqual(newApps([oldApp, newApp], now), [newApp]);
  });

  test("includes the threshold and sorts newest first", () => {
    const newest = app("Newest", "2026-08-18");
    const threshold = app("Threshold", "2026-07-20");

    assert.deepEqual(newApps([threshold, newest], now), [newest, threshold]);
  });

  test("excludes future dates", () => {
    assert.deepEqual(newApps([app("Future", "2026-08-20")], now), []);
  });
});
