import type { ReleaseLock } from "#catalog/core";
import type { App } from "#catalog/schema";
import { fetchFeedReleases } from "#scripts/releases/feed";
import { fetchForgeDownloadTotal, fetchForgeReleases } from "#scripts/releases/forge";
import { fetchGitLabReleases } from "#scripts/releases/gitlab";

export function fetchSourceReleases(app: App, lock: ReleaseLock) {
  switch (app.releaseSource.type) {
    case "github":
    case "codeberg":
      return fetchForgeReleases(app, lock);
    case "gitlab":
      return fetchGitLabReleases(app, lock);
    case "feed":
      return fetchFeedReleases(app, lock);
  }
}

export function fetchDownloadTotal(app: App) {
  switch (app.releaseSource.type) {
    case "github":
    case "codeberg":
      return fetchForgeDownloadTotal(app);
    case "gitlab":
    case "feed":
      return undefined;
  }
}
