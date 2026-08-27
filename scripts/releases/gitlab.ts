import { z } from "zod";
import { selectAssets } from "#catalog/artifacts";
import { httpsUrlSchema, type App, type ReleaseLock } from "#catalog/schema";
import { getJson, getPages } from "#scripts/releases/http";
import { normalizeDate, selectCurrent, type SourceRelease } from "#scripts/releases/model";

const releaseSchema = z.object({
  tag_name: z.string().min(1),
  released_at: z.iso.datetime({ offset: true }),
  upcoming_release: z.boolean().optional(),
  _links: z.object({ self: httpsUrlSchema }),
  assets: z.object({
    links: z.array(
      z.object({
        id: z.union([z.string(), z.number().int()]).optional(),
        name: z.string().min(1),
        direct_asset_url: httpsUrlSchema,
      })
    ),
  }),
});

const projectSchema = z.object({
  id: z.union([z.string(), z.number().int()]),
  web_url: httpsUrlSchema,
  namespace: z.object({ id: z.union([z.string(), z.number().int()]) }),
});

type GitLabRelease = z.infer<typeof releaseSchema>;

function repository(app: App) {
  if (app.releaseSource.type === "gitlab") {
    return app.releaseSource.repository;
  }

  throw new Error("Expected a GitLab source");
}

export function gitlabSourceReleases(app: App, lock: ReleaseLock, releases: GitLabRelease[]) {
  const source = repository(app);
  const ordered = [...releases].sort((left, right) =>
    right.released_at.localeCompare(left.released_at)
  );

  const current = selectCurrent(
    ordered.map((release) => ({
      version: release.tag_name,
      publishedAt: normalizeDate(release.released_at),
      page: release._links.self,
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
      publishedAt: normalizeDate(release.released_at),
      page: release._links.self,
      artifacts: selectAssets(app, release.assets.links).map(({ architecture, asset }) => {
        return {
          architecture,
          name: asset.name,
          url: asset.direct_asset_url,
          ...(asset.id !== undefined ? { assetId: String(asset.id) } : {}),
        };
      }),
    }));
}

export async function fetchGitLabReleases(app: App, lock: ReleaseLock) {
  const source = repository(app);
  const project = encodeURIComponent(source);
  const [projectData, releases] = await Promise.all([
    getJson(`https://gitlab.com/api/v4/projects/${project}`),
    getPages(
      z.array(releaseSchema),
      (page) => `https://gitlab.com/api/v4/projects/${project}/releases?per_page=100&page=${page}`,
      100
    ),
  ]);
  const identity = projectSchema.parse(projectData);
  const projectId = String(identity.id);

  return {
    source: {
      provider: "gitlab" as const,
      projectId,
      ownerId: String(identity.namespace.id),
      sourceUrl: identity.web_url,
    },
    releases: gitlabSourceReleases(
      app,
      lock,
      releases.filter((release) => !release.upcoming_release)
    ),
  };
}
