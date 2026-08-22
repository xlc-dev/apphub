import { z } from "zod";
import { sumReleaseDownloads } from "@catalog/downloads";
import { selectAssets, type ReleaseLock } from "@catalog/core";
import type { App } from "@catalog/schema";
import { getPages } from "./http";
import { normalizeDate, selectCurrent, type SourceRelease } from "./model";

const httpsUrl = z.url().refine((value) => new URL(value).protocol === "https:");

const assetSchema = z.object({
  name: z.string().min(1),
  browser_download_url: httpsUrl,
  size: z.number().int().positive(),
  digest: z.string().nullable().optional(),
  download_count: z.number().int().nonnegative().optional(),
});

const releaseSchema = z.object({
  tag_name: z.string().min(1),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  html_url: httpsUrl,
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(assetSchema),
});

const downloadSchema = z.array(
  z.object({
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(
      z.object({
        name: z.string(),
        download_count: z.number().int().nonnegative(),
      })
    ),
  })
);

type ForgeRelease = z.infer<typeof releaseSchema> & { published_at: string };
type ForgeType = "github" | "codeberg";

const githubHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "AppHub catalog updater",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) {
  githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

function repository(app: App) {
  const source = app.releaseSource;

  if (source.type === "github" || source.type === "codeberg") {
    return source;
  }

  throw new Error("Expected a GitHub or Codeberg source");
}

function stableReleases(releases: z.infer<typeof releaseSchema>[]) {
  return releases.filter(
    (release): release is ForgeRelease =>
      !release.draft && !release.prerelease && release.published_at !== null
  );
}

function getForgeReleases(type: ForgeType, repository: string) {
  if (type === "github") {
    return getPages(
      z.array(releaseSchema),
      (page) => `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      100,
      githubHeaders
    );
  }

  return getPages(
    z.array(releaseSchema),
    (page) => `https://codeberg.org/api/v1/repos/${repository}/releases?limit=50&page=${page}`,
    50
  );
}

export function forgeSourceReleases(app: App, lock: ReleaseLock, releases: ForgeRelease[]) {
  const source = repository(app).repository;
  const ordered = [...releases].sort((left, right) =>
    right.published_at.localeCompare(left.published_at)
  );

  const current = selectCurrent(
    ordered.map((release) => ({
      version: release.tag_name,
      publishedAt: normalizeDate(release.published_at),
      page: release.html_url,
      artifacts: [],
    })),
    lock,
    source
  );

  const versions = new Set(current.map(({ version }) => version));

  return ordered
    .filter((release) => versions.has(release.tag_name))
    .map((release): SourceRelease => ({
      version: release.tag_name,
      publishedAt: normalizeDate(release.published_at),
      page: release.html_url,
      artifacts: selectAssets(app, release.assets).map(({ architecture, asset }) => {
        const digest = asset.digest?.startsWith("sha256:")
          ? asset.digest.slice("sha256:".length)
          : undefined;

        return {
          architecture,
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
          ...(digest ? { sha256: digest } : {}),
        };
      }),
    }));
}

export async function fetchForgeReleases(app: App, lock: ReleaseLock) {
  const source = repository(app);
  const releases = await getForgeReleases(source.type, source.repository);

  return forgeSourceReleases(app, lock, stableReleases(releases));
}

export async function fetchForgeDownloadTotal(app: App) {
  const source = repository(app);
  const releases = await getForgeReleases(source.type, source.repository);

  return sumReleaseDownloads(downloadSchema.parse(releases));
}
