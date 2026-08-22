import { writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  hashDownload,
  readApps,
  selectAssets,
  type Artifact,
  type ReleaseLock,
} from "@catalog/core";
import type { App, Architecture } from "@catalog/schema";
import { githubJson } from "./github";

const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:");
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const githubAssetSchema = z.object({
  name: z.string().min(1),
  browser_download_url: httpsUrlSchema,
  size: z.number().int().positive(),
  digest: z.string().nullable().optional(),
});
const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  published_at: z.string().nullable(),
  html_url: httpsUrlSchema,
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(githubAssetSchema),
});
type GitHubRelease = z.infer<typeof githubReleaseSchema> & { published_at: string };
const feedSchema = z
  .object({
    releases: z.array(
      z
        .object({
          version: z.string().min(1).max(200),
          publishedAt: z.iso.datetime(),
          page: httpsUrlSchema,
          artifacts: z
            .array(
              z
                .object({
                  architecture: z.string().regex(/^[a-z0-9][a-z0-9_+-]*$/),
                  name: z.string().min(1).max(255),
                  url: httpsUrlSchema,
                  size: z.number().int().positive(),
                  sha256: sha256Schema.optional(),
                })
                .strict()
            )
            .min(1)
            .max(50),
        })
        .strict()
    ),
  })
  .strict();

interface SourceArtifact {
  architecture: Architecture;
  name: string;
  url: string;
  size: number;
  sha256?: string;
}

interface SourceRelease {
  version: string;
  publishedAt: string;
  page: string;
  artifacts: SourceArtifact[];
}

export function selectCurrent(releases: SourceRelease[], lock: ReleaseLock, source: string) {
  const latest = releases[0];

  if (!latest) throw new Error(`${source}: no stable release found`);
  if (new Set(releases.map(({ version }) => version)).size !== releases.length)
    throw new Error(`${source}: release versions are not unique`);
  if (
    releases.some(
      (release, index) => index > 0 && release.publishedAt > releases[index - 1]!.publishedAt
    )
  )
    throw new Error(`${source}: releases are not ordered newest first`);
  if (
    releases.some(
      ({ artifacts }) =>
        new Set(artifacts.map(({ architecture }) => architecture)).size !== artifacts.length
    )
  )
    throw new Error(`${source}: release architectures are not unique`);
  if (lock.releases.length === 0) return [latest];

  const recorded = new Set(lock.releases.map(({ version }) => version));
  const boundary = releases.findIndex(({ version }) => recorded.has(version));

  if (boundary < 0) throw new Error(`${source}: recorded release not found in release history`);

  return releases.slice(0, boundary + 1);
}

export function githubSourceReleases(app: App, lock: ReleaseLock, releases: GitHubRelease[]) {
  if (app.releaseSource.type !== "github") throw new Error("Expected a GitHub source");

  const source = app.releaseSource.repository;
  const ordered = [...releases].sort((left, right) =>
    right.published_at.localeCompare(left.published_at)
  );
  const current = selectCurrent(
    ordered.map((release) => ({
      version: release.tag_name,
      publishedAt: release.published_at,
      page: release.html_url,
      artifacts: [],
    })),
    lock,
    source
  );
  const selected = new Set(current.map(({ version }) => version));

  return ordered
    .filter((release) => selected.has(release.tag_name))
    .map((release): SourceRelease => ({
      version: release.tag_name,
      publishedAt: release.published_at,
      page: release.html_url,
      artifacts: selectAssets(app, release.assets).map(({ architecture, asset }) => {
        const sha256 = asset.digest?.startsWith("sha256:")
          ? asset.digest.slice("sha256:".length)
          : undefined;

        return {
          architecture,
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
          ...(sha256 ? { sha256 } : {}),
        };
      }),
    }));
}

async function githubReleases(app: App, lock: ReleaseLock) {
  if (app.releaseSource.type !== "github") throw new Error("Expected a GitHub source");

  const source = app.releaseSource.repository;
  const releases = z
    .array(githubReleaseSchema)
    .parse(await githubJson(`/repos/${source}/releases?per_page=100`))
    .filter(
      (release): release is GitHubRelease =>
        !release.draft && !release.prerelease && release.published_at !== null
    );

  return githubSourceReleases(app, lock, releases);
}

async function feedReleases(app: App, lock: ReleaseLock) {
  if (app.releaseSource.type !== "feed") throw new Error("Expected a feed source");

  const response = await fetch(app.releaseSource.url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok) throw new Error(`${app.releaseSource.url}: returned ${response.status}`);

  const { releases } = feedSchema.parse(await response.json());

  return selectCurrent(releases as SourceRelease[], lock, app.releaseSource.url);
}

function verifyRecorded(appId: string, source: SourceRelease, lock: ReleaseLock) {
  const recorded = lock.releases.find(({ version }) => version === source.version);

  if (!recorded) return false;
  if (recorded.page !== source.page || recorded.publishedAt !== source.publishedAt)
    throw new Error(`${appId} ${source.version}: published release metadata changed`);
  if (recorded.artifacts.length !== source.artifacts.length)
    throw new Error(`${appId} ${source.version}: published artifacts changed`);

  for (const artifact of source.artifacts) {
    const existing = recorded.artifacts.find(
      ({ architecture }) => architecture === artifact.architecture
    );

    if (
      !existing ||
      existing.name !== artifact.name ||
      existing.url !== artifact.url ||
      existing.size !== artifact.size
    )
      throw new Error(`${appId} ${source.version}: published artifact changed`);
    if (artifact.sha256 && existing.sha256 !== artifact.sha256)
      throw new Error(`${appId} ${source.version}: published checksum changed`);
  }

  return true;
}

async function recordRelease(release: SourceRelease): Promise<ReleaseLock["releases"][number]> {
  const artifacts: Artifact[] = [];

  for (const artifact of release.artifacts) {
    const calculated = artifact.sha256
      ? { size: artifact.size, sha256: sha256Schema.parse(artifact.sha256) }
      : await hashDownload(artifact);

    artifacts.push({ ...artifact, ...calculated });
  }

  return { ...release, artifacts };
}

async function main() {
  const requestedSlug = process.argv[2];
  if (process.argv.length > 3) throw new Error("Usage: bun run update-releases [slug]");

  const entries = await readApps();
  const selectedEntries = requestedSlug
    ? entries.filter(({ slug }) => slug === requestedSlug)
    : entries;

  if (requestedSlug && selectedEntries.length === 0)
    throw new Error(`Unknown application: ${requestedSlug}`);

  const changes: Array<{ url: URL; data: unknown }> = [];

  for (const { app, directory, lock } of selectedEntries) {
    const updatedLock = structuredClone(lock);
    const releases =
      app.releaseSource.type === "github"
        ? await githubReleases(app, lock)
        : app.releaseSource.type === "feed"
          ? await feedReleases(app, lock)
          : undefined;

    if (releases) {
      for (const release of releases.reverse()) {
        if (!verifyRecorded(app.id, release, lock))
          updatedLock.releases.unshift(await recordRelease(release));
      }
    }

    if (updatedLock.releases.length !== lock.releases.length) {
      changes.push({ url: new URL("releases.json", directory), data: updatedLock });
      console.log(`${app.id}: found new releases`);
    } else {
      console.log(`${app.id}: releases are current`);
    }
  }

  await Promise.all(
    changes.map(({ url, data }) => writeFile(url, `${JSON.stringify(data, null, 2)}\n`))
  );
}

if (import.meta.main) await main();
