import { writeFile } from "node:fs/promises";
import { z } from "astro/zod";
import {
  readApps,
  hashDownload,
  selectAssets,
  sha256,
  validatePng,
  type Artifact,
  type ReleaseLock,
} from "@catalog/core";

const githubAssetSchema = z.object({
  name: z.string().min(1),
  browser_download_url: z.url(),
  size: z.number().int().positive(),
  digest: z.string().nullable().optional(),
});

const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  published_at: z.string().nullable(),
  html_url: z.url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(githubAssetSchema),
});

type GitHubAsset = z.infer<typeof githubAssetSchema>;
type GitHubRelease = z.infer<typeof githubReleaseSchema>;

const apiHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "AppHub release updater",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) apiHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchBytes(url: string, maximumSize: number) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok || !response.body)
    throw new Error(`${url}: download returned ${response.status}`);

  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > maximumSize) throw new Error(`${url}: file is too large`);

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;
    size += value.byteLength;
    if (size > maximumSize) throw new Error(`${url}: file is too large`);
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

async function githubReleases(repository: string, lock: ReleaseLock) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
    {
      headers: apiHeaders,
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) throw new Error(`${repository}: GitHub returned ${response.status}`);

  const releases = z
    .array(githubReleaseSchema)
    .parse(await response.json())
    .filter(
      (release): release is GitHubRelease & { published_at: string } =>
        !release.draft && !release.prerelease && release.published_at !== null
    );

  const latest = releases[0];

  if (!latest) throw new Error(`${repository}: no stable GitHub release found`);
  if (lock.releases.length === 0) return [latest];

  const recorded = new Set(lock.releases.map((release) => release.version));
  const firstRecorded = releases.findIndex((release) => recorded.has(release.tag_name));

  if (firstRecorded < 0)
    throw new Error(`${repository}: recorded release not found in the latest 100 releases`);

  return releases.slice(0, firstRecorded + 1);
}

function verifyRecordedRelease(
  appId: string,
  release: GitHubRelease & { published_at: string },
  selected: ReturnType<typeof selectAssets<GitHubAsset>>,
  lock: ReleaseLock
) {
  const recorded = lock.releases.find((item) => item.version === release.tag_name);

  if (!recorded) return false;
  if (recorded.page !== release.html_url || recorded.publishedAt !== release.published_at)
    throw new Error(`${appId} ${release.tag_name}: published release metadata changed`);
  if (recorded.artifacts.length !== selected.length)
    throw new Error(`${appId} ${release.tag_name}: published artifacts changed`);

  for (const { architecture, asset } of selected) {
    const artifact = recorded.artifacts.find((item) => item.architecture === architecture);
    const digest = asset.digest?.replace(/^sha256:/, "");

    if (
      !artifact ||
      artifact.name !== asset.name ||
      artifact.url !== asset.browser_download_url ||
      artifact.size !== asset.size
    )
      throw new Error(`${appId} ${release.tag_name}: published artifact changed`);
    if (digest && artifact.sha256 !== digest)
      throw new Error(`${appId} ${release.tag_name}: published checksum changed`);
  }

  return true;
}

const changes: Array<{ url: URL; data: string | Uint8Array }> = [];
const requestedSlug = process.argv[2];
if (process.argv.length > 3) throw new Error("Usage: bun run update-releases [slug]");

const entries = await readApps();

const selectedEntries = requestedSlug
  ? entries.filter((entry) => entry.slug === requestedSlug)
  : entries;

if (requestedSlug && selectedEntries.length === 0)
  throw new Error(`Unknown application: ${requestedSlug}`);

for (const { app, directory, lock } of selectedEntries) {
  const updatedLock = structuredClone(lock);
  const icon = await fetchBytes(app.icon, 1024 * 1024);
  const iconDigest = sha256(icon);

  validatePng(icon, app.id);

  if (lock.icon?.source === app.icon && lock.icon.sha256 !== iconDigest)
    throw new Error(`${app.id}: published icon changed`);

  updatedLock.icon = { source: app.icon, size: icon.byteLength, sha256: iconDigest };

  if (app.releaseSource.type === "direct") {
    changes.push(
      { url: new URL("icon.png", directory), data: icon },
      {
        url: new URL("releases.json", directory),
        data: `${JSON.stringify(updatedLock, null, 2)}\n`,
      }
    );
    console.log(`${app.id}: releases are maintained directly`);
    continue;
  }

  const releases = await githubReleases(app.releaseSource.repository, lock);
  const pending: Array<{
    release: GitHubRelease & { published_at: string };
    selected: ReturnType<typeof selectAssets<GitHubAsset>>;
  }> = [];

  for (const release of releases) {
    const selected = selectAssets(app, release.assets);

    if (!verifyRecordedRelease(app.id, release, selected, lock))
      pending.push({ release, selected });
  }

  for (const { release, selected } of pending.reverse()) {
    const artifacts: Artifact[] = [];

    for (const { architecture, asset } of selected) {
      const calculated = await hashDownload({
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
      });
      const publishedDigest = asset.digest?.replace(/^sha256:/, "");

      if (publishedDigest && calculated.sha256 !== publishedDigest)
        throw new Error(`${asset.name}: download differs from published checksum`);

      artifacts.push({
        architecture,
        name: asset.name,
        url: asset.browser_download_url,
        size: calculated.size,
        sha256: calculated.sha256,
      });
    }

    updatedLock.releases.unshift({
      version: release.tag_name,
      publishedAt: release.published_at,
      page: release.html_url,
      artifacts,
    });
  }

  changes.push(
    { url: new URL("icon.png", directory), data: icon },
    { url: new URL("releases.json", directory), data: `${JSON.stringify(updatedLock, null, 2)}\n` }
  );

  const latest = releases[0]!;

  console.log(
    pending.length === 0
      ? `${app.id}: already current at ${latest.tag_name}`
      : `${app.id}: found ${pending.length} new release${pending.length === 1 ? "" : "s"}`
  );
}

await Promise.all(changes.map((change) => writeFile(change.url, change.data)));
