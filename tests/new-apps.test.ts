import { describe, expect, test } from "bun:test";
import { newApps, newAppWindowDays } from "@/lib/new-apps";

const now = new Date("2026-08-19T12:00:00Z");

function app(name: string, releases: string[]) {
  return { name, releases: releases.map((publishedAt) => ({ publishedAt })) };
}

describe("new apps", () => {
  test("uses the oldest recorded release as the addition date", () => {
    const recentUpdateToOldApp = app("Old", ["2026-08-18T00:00:00Z", "2026-01-01T00:00:00Z"]);
    const newApp = app("New", ["2026-08-10T00:00:00Z"]);

    expect(newApps([recentUpdateToOldApp, newApp], now)).toEqual([newApp]);
  });

  test("includes the threshold and sorts newest first", () => {
    const newest = app("Newest", ["2026-08-18T00:00:00Z"]);
    const threshold = app("Threshold", [
      new Date(now.getTime() - newAppWindowDays * 24 * 60 * 60 * 1000).toISOString(),
    ]);

    expect(newApps([threshold, newest], now)).toEqual([newest, threshold]);
  });

  test("excludes apps without releases and future dates", () => {
    expect(newApps([app("Missing", []), app("Future", ["2026-08-20T00:00:00Z"])], now)).toEqual(
      []
    );
  });
});
