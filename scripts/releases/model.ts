import type { ReleaseLock } from "@catalog/core";
import type { Architecture } from "@catalog/schema";

interface SourceArtifact {
  architecture: Architecture;
  name: string;
  url: string;
  size?: number;
  sha256?: string;
}

export interface SourceRelease {
  version: string;
  publishedAt: string;
  page: string;
  artifacts: SourceArtifact[];
}

export function normalizeDate(value: string) {
  return value.endsWith("Z") ? value : new Date(value).toISOString();
}

export function selectCurrent(releases: SourceRelease[], lock: ReleaseLock, source: string) {
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

  if (lock.releases.length === 0) {
    return [latest];
  }

  const recorded = new Set(lock.releases.map(({ version }) => version));
  const boundary = releases.findIndex(({ version }) => recorded.has(version));

  if (boundary < 0) {
    throw new Error(`${source}: recorded release not found in release history`);
  }

  return releases.slice(0, boundary + 1);
}
