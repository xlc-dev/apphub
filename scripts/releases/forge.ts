import { z } from "zod";
import { sumReleaseDownloads } from "#catalog/downloads";
import { selectAssets } from "#catalog/artifacts";
import { httpsUrlSchema, type App, type ReleaseLock } from "#catalog/schema";
import { getJson, getPages } from "#scripts/releases/http";
import { normalizeDate, selectCurrent, type SourceRelease } from "#scripts/releases/model";

const assetSchema = z.object({
  id: z.union([z.string(), z.number().int()]).optional(),
  name: z.string().min(1),
  browser_download_url: httpsUrlSchema,
  size: z.number().int().positive(),
  digest: z.string().nullable().optional(),
  download_count: z.number().int().nonnegative().optional(),
});

const releaseSchema = z.object({
  id: z.union([z.string(), z.number().int()]).optional(),
  tag_name: z.string().min(1),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  html_url: httpsUrlSchema,
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(assetSchema),
});

const repositorySchema = z.object({
  id: z.union([z.string(), z.number().int()]),
  full_name: z.string().min(1),
  html_url: httpsUrlSchema,
  owner: z.object({ id: z.union([z.string(), z.number().int()]) }),
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

type ForgeResponse = z.infer<typeof releaseSchema>;
type ForgeRelease = ForgeResponse & { published_at: string };
type ForgeType = "github" | "codeberg";

const releaseRequests = new Map<string, Promise<ForgeResponse[]>>();

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

function stableReleases(releases: Array<z.infer<typeof releaseSchema>>) {
  return releases.filter(
    (release): release is ForgeRelease =>
      !release.draft && !release.prerelease && release.published_at !== null
  );
}

function getForgeReleases(type: ForgeType, repository: string) {
  const key = `${type}:${repository}`;
  const existing = releaseRequests.get(key);

  if (existing) {
    return existing;
  }

  const request =
    type === "github"
      ? getPages(
          z.array(releaseSchema),
          (page) => `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
          100,
          githubHeaders
        )
      : getPages(
          z.array(releaseSchema),
          (page) =>
            `https://codeberg.org/api/v1/repos/${repository}/releases?limit=50&page=${page}`,
          50
        );

  releaseRequests.set(key, request);

  return request;
}

async function getForgeReleasePage(type: ForgeType, repository: string) {
  const url =
    type === "github"
      ? `https://api.github.com/repos/${repository}/releases?per_page=100&page=1`
      : `https://codeberg.org/api/v1/repos/${repository}/releases?limit=50&page=1`;

  const value = await getJson(url, type === "github" ? githubHeaders : undefined);

  return z.array(releaseSchema).parse(value);
}

async function getForgeRepository(type: ForgeType, repository: string) {
  const url =
    type === "github"
      ? `https://api.github.com/repos/${repository}`
      : `https://codeberg.org/api/v1/repos/${repository}`;

  return repositorySchema.parse(await getJson(url, type === "github" ? githubHeaders : undefined));
}

export function forgeSourceReleases(app: App, lock: ReleaseLock, releases: ForgeRelease[]) {
  const releaseSource = repository(app);
  const source = releaseSource.repository;
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
      ...(release.id !== undefined ? { releaseId: String(release.id) } : {}),
      artifacts: selectAssets(app, release.assets).map(({ architecture, asset }) => {
        const digest = asset.digest?.startsWith("sha256:")
          ? asset.digest.slice("sha256:".length)
          : undefined;

        return {
          architecture,
          name: asset.name,
          url: asset.browser_download_url,
          ...(asset.id !== undefined ? { assetId: String(asset.id) } : {}),
          size: asset.size,
          ...(digest
            ? {
                publishedSha256: { value: digest, sourceUrl: release.html_url },
              }
            : {}),
        };
      }),
    }));
}

export async function fetchForgeReleases(app: App, lock: ReleaseLock) {
  const source = repository(app);
  const [repositoryData, releases] = await Promise.all([
    getForgeRepository(source.type, source.repository),
    lock.releases.length
      ? getForgeReleases(source.type, source.repository)
      : getForgeReleasePage(source.type, source.repository),
  ]);
  const projectId = String(repositoryData.id);

  return {
    source: {
      provider: source.type,
      projectId,
      ownerId: String(repositoryData.owner.id),
      sourceUrl: repositoryData.html_url,
    },
    releases: forgeSourceReleases(app, lock, stableReleases(releases)),
  };
}

export async function fetchForgeDownloadTotal(app: App) {
  const source = repository(app);
  const releases = await getForgeReleases(source.type, source.repository);

  return sumReleaseDownloads(downloadSchema.parse(releases));
}
