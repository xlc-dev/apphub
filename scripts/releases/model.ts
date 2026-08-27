import type { HttpValidator } from "#catalog/refresh";
import { RefreshError } from "#catalog/refresh";
import type { Architecture, ReleaseLock } from "#catalog/schema";

interface SourceArtifact {
  architecture: Architecture;
  name: string;
  url: string;
  assetId?: string;
  size?: number;
  publishedSha256?: { value: string; sourceUrl: string };
  signatures?: Array<{ kind: string; url: string }>;
}

export interface SourceRelease {
  version: string;
  publishedAt: string;
  page: string;
  releaseId?: string;
  artifacts: SourceArtifact[];
}

interface ReleaseSourceIdentity {
  provider: "github" | "gitlab" | "codeberg" | "feed";
  projectId?: string;
  ownerId?: string;
  sourceUrl: string;
  validator?: HttpValidator;
}

export interface SourceResult {
  source: ReleaseSourceIdentity;
  releases: SourceRelease[];
  notModified?: boolean;
}

interface ReleaseBoundary {
  version: string;
  publishedAt: string;
  artifacts: Array<{ architecture: Architecture }>;
}

export function normalizeDate(value: string) {
  return value.endsWith("Z") ? value : new Date(value).toISOString();
}

export function selectCurrent<T extends ReleaseBoundary>(
  releases: T[],
  lock: ReleaseLock,
  source: string
) {
  const latest = releases[0];

  if (!latest) {
    throw new Error(`${source}: no stable release found`);
  }

  if (new Set(releases.map(({ version }) => version)).size !== releases.length) {
    throw new Error(`${source}: release versions are not unique`);
  }

  const datesAreOrdered = releases.every(
    (release, index) => index === 0 || release.publishedAt <= releases[index - 1]!.publishedAt
  );

  if (!datesAreOrdered) {
    throw new Error(`${source}: releases are not ordered newest first`);
  }

  const architecturesAreUnique = releases.every(
    ({ artifacts }) =>
      new Set(artifacts.map(({ architecture }) => architecture)).size === artifacts.length
  );

  if (!architecturesAreUnique) {
    throw new Error(`${source}: release architectures are not unique`);
  }

  const recorded = lock.releases[0];

  if (
    recorded &&
    latest.version !== recorded.version &&
    latest.publishedAt <= recorded.publishedAt
  ) {
    throw new RefreshError(
      "integrity",
      `${source}: recorded current release is no longer available`
    );
  }

  return [latest];
}
