import { describe, expect, test } from "bun:test";
import { githubSourceReleases } from "../scripts/update-releases";
import type { App, ReleaseLock } from "@catalog/schema";

const app = {
  id: "org.example.App",
  releaseSource: { type: "github", repository: "example/app" },
} as App;

const lock = {
  appId: app.id,
  releases: [
    {
      version: "2.0",
      publishedAt: "2026-01-02T00:00:00Z",
      page: "https://github.com/example/app/releases/tag/2.0",
      artifacts: [],
    },
  ],
} satisfies ReleaseLock;

describe("GitHub release updates", () => {
  test("sorts releases without mutating the source", () => {
    const source = [
      {
        tag_name: "3.0",
        published_at: "2026-01-03T00:00:00Z",
        html_url: "https://github.com/example/app/releases/tag/3.0",
        draft: false,
        prerelease: false,
        assets: [
          {
            name: "App-3.0-x86_64.AppImage",
            browser_download_url:
              "https://github.com/example/app/releases/download/3.0/App-3.0-x86_64.AppImage",
            size: 100,
          },
        ],
      },
      {
        tag_name: "2.0",
        published_at: "2026-01-02T00:00:00Z",
        html_url: "https://github.com/example/app/releases/tag/2.0",
        draft: false,
        prerelease: false,
        assets: [
          {
            name: "App-2.0-x86_64.AppImage",
            browser_download_url:
              "https://github.com/example/app/releases/download/2.0/App-2.0-x86_64.AppImage",
            size: 100,
          },
        ],
      },
      {
        tag_name: "1.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/example/app/releases/tag/1.0",
        draft: false,
        prerelease: false,
        assets: [],
      },
    ];
    source.reverse();

    const releases = githubSourceReleases(app, lock, source);

    expect(releases.map(({ version }) => version)).toEqual(["3.0", "2.0"]);
    expect(source.map(({ tag_name }) => tag_name)).toEqual(["1.0", "2.0", "3.0"]);
  });
});
