import type { ReleaseLock } from "@catalog/core";
import type { App } from "@catalog/schema";
import { fetchFeedReleases } from "./feed";
import { fetchForgeDownloadTotal, fetchForgeReleases } from "./forge";
import { fetchGitLabReleases } from "./gitlab";

export function fetchSourceReleases(app: App, lock: ReleaseLock) {
  switch (app.releaseSource.type) {
    case "github":
    case "codeberg":
      return fetchForgeReleases(app, lock);
    case "gitlab":
      return fetchGitLabReleases(app, lock);
    case "feed":
      return fetchFeedReleases(app, lock);
    case "direct":
      return undefined;
  }
}

export function fetchDownloadTotal(app: App) {
  switch (app.releaseSource.type) {
    case "github":
    case "codeberg":
      return fetchForgeDownloadTotal(app);
    case "gitlab":
    case "feed":
    case "direct":
      return undefined;
  }
}
