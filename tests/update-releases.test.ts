import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forgeSourceReleases } from "#scripts/releases/forge";
import { gitlabSourceReleases } from "#scripts/releases/gitlab";
import type { App, ReleaseLock } from "#catalog/schema";

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

    const releases = forgeSourceReleases(app, lock, source);

    assert.deepEqual(
      releases.map(({ version }) => version),
      ["3.0", "2.0"]
    );
    assert.deepEqual(
      source.map(({ tag_name }) => tag_name),
      ["1.0", "2.0", "3.0"]
    );
  });
});

describe("GitLab release updates", () => {
  test("selects AppImage release links without a published size", () => {
    const gitlabApp = {
      ...app,
      releaseSource: { type: "gitlab", repository: "example/tools/app" },
    } satisfies App;
    const releases = gitlabSourceReleases(gitlabApp, { ...lock, releases: [] }, [
      {
        tag_name: "3.0",
        released_at: "2026-08-21T12:00:00Z",
        upcoming_release: false,
        _links: { self: "https://gitlab.com/example/tools/app/-/releases/3.0" },
        assets: {
          links: [
            {
              name: "Example-3.0-x86_64.AppImage",
              direct_asset_url:
                "https://gitlab.com/example/tools/app/-/releases/3.0/downloads/Example.AppImage",
            },
          ],
        },
      },
    ]);

    assert.deepEqual(releases, [
      {
        version: "3.0",
        publishedAt: "2026-08-21T12:00:00Z",
        page: "https://gitlab.com/example/tools/app/-/releases/3.0",
        artifacts: [
          {
            architecture: "x86_64",
            name: "Example-3.0-x86_64.AppImage",
            url: "https://gitlab.com/example/tools/app/-/releases/3.0/downloads/Example.AppImage",
          },
        ],
      },
    ]);
  });
});

describe("Codeberg release updates", () => {
  test("uses Codeberg release assets directly", () => {
    const codebergApp = {
      ...app,
      releaseSource: { type: "codeberg", repository: "example/app" },
    } satisfies App;
    const releases = forgeSourceReleases(codebergApp, { ...lock, releases: [] }, [
      {
        tag_name: "3.0",
        published_at: "2026-08-21T12:00:00Z",
        html_url: "https://codeberg.org/example/app/releases/tag/3.0",
        draft: false,
        prerelease: false,
        assets: [
          {
            name: "Example-3.0-x86_64.AppImage",
            browser_download_url:
              "https://codeberg.org/example/app/releases/download/3.0/Example.AppImage",
            size: 100,
            download_count: 42,
          },
        ],
      },
    ]);

    assert.deepEqual(releases[0]?.artifacts[0], {
      architecture: "x86_64",
      name: "Example-3.0-x86_64.AppImage",
      url: "https://codeberg.org/example/app/releases/download/3.0/Example.AppImage",
      size: 100,
    });
  });
});
