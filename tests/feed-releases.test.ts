import { expect, test } from "bun:test";
import { feedSourceReleases } from "../scripts/releases/feed";
import type { App, ReleaseLock } from "@catalog/schema";

const app = {
  id: "org.example.App",
  releaseSource: { type: "feed", url: "https://example.org/releases.json" },
} as App;

const lock = {
  appId: app.id,
  releases: [],
} satisfies ReleaseLock;

test("validates and normalizes feed releases", () => {
  const releases = feedSourceReleases(app, lock, {
    releases: [
      {
        version: "1.0",
        publishedAt: "2026-08-20T10:49:50+02:00",
        page: "https://example.org/releases/1.0",
        artifacts: [
          {
            architecture: "x86_64",
            name: "Example-x86_64.AppImage",
            url: "https://example.org/Example-x86_64.AppImage",
            size: 100,
          },
        ],
      },
    ],
  });

  expect(releases).toEqual([
    {
      version: "1.0",
      publishedAt: "2026-08-20T08:49:50.000Z",
      page: "https://example.org/releases/1.0",
      artifacts: [
        {
          architecture: "x86_64",
          name: "Example-x86_64.AppImage",
          url: "https://example.org/Example-x86_64.AppImage",
          size: 100,
        },
      ],
    },
  ]);
});
