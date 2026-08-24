import { readFile } from "node:fs/promises";
import { z } from "zod";
import { downloadCounts, downloadHistorySchema, latestDownloadDate } from "#catalog/downloads";
import { imageType, readApps, root } from "#catalog/core";
import { appSchema, releaseSchema } from "#catalog/schema";
import { categoryName, categorySlug } from "#lib/categories";
import { newApps, newAppWindowDays } from "#lib/new-apps";
import { sitePath } from "#lib/paths";
import { getRepositoryStars } from "#lib/repository-stars";

const imageTypeSchema = z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]);

const apiImageSchema = z
  .object({
    source: z.url(),
    url: z.string().min(1),
    type: imageTypeSchema,
  })
  .strict();

const apiScreenshotSchema = apiImageSchema.extend({ caption: z.string().min(1) }).strict();

const apiAppSchema = appSchema
  .omit({ assets: true, releaseSource: true, screenshots: true })
  .extend({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    icon: apiImageSchema,
    screenshots: z.array(apiScreenshotSchema).min(1).max(10),
    releases: z.array(releaseSchema),
  })
  .strict();

const apiCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    count: z.number().int().nonnegative(),
    url: z.string().min(1),
    webUrl: z.string().min(1),
  })
  .strict();

const apiStatisticsSchema = z
  .object({
    stars: z.number().int().nonnegative().nullable(),
    downloads: z
      .object({
        updatedAt: z.iso.date().nullable(),
        week: z.number().int().nonnegative().nullable(),
        month: z.number().int().nonnegative().nullable(),
        allTime: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

const apiAppResourceSchema = apiAppSchema
  .extend({ url: z.string().min(1), webUrl: z.string().min(1), statistics: apiStatisticsSchema })
  .strict();

const apiAppSummarySchema = apiAppResourceSchema
  .pick({
    id: true,
    slug: true,
    name: true,
    summary: true,
    source: true,
    addedAt: true,
    categories: true,
    deprecated: true,
    replacedBy: true,
    icon: true,
    url: true,
    webUrl: true,
    statistics: true,
  })
  .extend({
    latestRelease: z
      .object({
        version: z.string().min(1).max(200),
        publishedAt: z.iso.datetime(),
        architectures: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const apiCategoryDetailsSchema = apiCategorySchema
  .extend({ apps: z.array(apiAppSummarySchema) })
  .strict();

const apiArchitectureSchema = z
  .object({
    id: z.string().min(1),
    count: z.number().int().nonnegative(),
    url: z.string().min(1),
  })
  .strict();

export const apiArchitectureDetailsSchema = apiArchitectureSchema
  .extend({ apps: z.array(apiAppSummarySchema) })
  .strict();

const apiMetadataSchema = z
  .object({
    version: z.literal("v1"),
    generatedAt: z.iso.datetime(),
    downloadsUpdatedAt: z.iso.date().nullable(),
    counts: z
      .object({
        apps: z.number().int().nonnegative(),
        categories: z.number().int().nonnegative(),
        architectures: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const apiNewAppsSchema = z
  .object({ windowDays: z.number().int().positive(), apps: z.array(apiAppSummarySchema) })
  .strict();

const apiUpdatedAppsSchema = z.object({ apps: z.array(apiAppSummarySchema) }).strict();

const rankingPeriodSchema = z.enum(["week", "month", "all-time"]);

export const apiRankingSchema = z
  .object({
    period: rankingPeriodSchema,
    entries: z
      .array(
        z.object({ app: apiAppSummarySchema, downloads: z.number().int().nonnegative() }).strict()
      )
      .nullable(),
  })
  .strict();

export type ApiApp = z.infer<typeof apiAppSchema>;
export type ApiAppResource = z.infer<typeof apiAppResourceSchema>;
export type RankingPeriod = z.infer<typeof rankingPeriodSchema>;

const icons = import.meta.glob<string>("/.generated/apps/*/icon.*", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

const screenshots = import.meta.glob<string>("/.generated/apps/*/screenshot-*.*", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

let appsPromise: Promise<ApiApp[]> | undefined;
let downloadHistoryPromise: Promise<z.infer<typeof downloadHistorySchema>> | undefined;
let resourcesPromise: Promise<ApiAppResource[]> | undefined;

async function loadApps() {
  const entries = await readApps();
  const apps = entries
    .map(({ slug, iconFile, app, lock }) => {
      const { assets: _assets, releaseSource: _releaseSource, ...manifest } = app;

      return {
        ...manifest,
        slug,
        icon: {
          ...app.icon,
          url: icons[`/.generated/apps/${slug}/${iconFile}`]!,
          type: imageType(iconFile),
        },
        screenshots: app.screenshots.map(({ file, ...screenshot }) => ({
          ...screenshot,
          url: screenshots[`/.generated/apps/${slug}/${file}`]!,
          type: imageType(file),
        })),
        releases: lock.releases,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return z.array(apiAppSchema).parse(apps);
}

export function getApps() {
  return (appsPromise ??= loadApps());
}

async function loadDownloadHistory() {
  const data = await readFile(new URL(".generated/downloads.json", root), "utf8");

  return downloadHistorySchema.parse(JSON.parse(data));
}

function getDownloadHistory() {
  return (downloadHistoryPromise ??= loadDownloadHistory());
}

export async function getAppDownloads(appId: string) {
  return downloadCounts(await getDownloadHistory())?.[appId];
}

async function loadApiResources() {
  const [apps, history, stars] = await Promise.all([
    getApps(),
    getDownloadHistory(),
    getRepositoryStars(),
  ]);
  const week = downloadCounts(history, 7);
  const month = downloadCounts(history, 30);
  const allTime = downloadCounts(history);
  const updatedAt = latestDownloadDate(history);

  return z.array(apiAppResourceSchema).parse(
    apps.map((app) => ({
      ...app,
      url: sitePath(`/api/v1/apps/${app.id}.json`),
      webUrl: sitePath(`/apps/${app.slug}/`),
      statistics: {
        stars: stars[app.slug] ?? null,
        downloads: {
          updatedAt,
          week: week?.[app.id] ?? null,
          month: month?.[app.id] ?? null,
          allTime: allTime?.[app.id] ?? null,
        },
      },
    }))
  );
}

export function getApiApps() {
  return (resourcesPromise ??= loadApiResources());
}

function appSummary(app: ApiAppResource) {
  const latest = app.releases[0];

  return apiAppSummarySchema.parse({
    id: app.id,
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    source: app.source,
    addedAt: app.addedAt,
    categories: app.categories,
    deprecated: app.deprecated,
    replacedBy: app.replacedBy,
    icon: app.icon,
    url: app.url,
    webUrl: app.webUrl,
    statistics: app.statistics,
    latestRelease: latest
      ? {
          version: latest.version,
          publishedAt: latest.publishedAt,
          architectures: latest.artifacts.map(({ architecture }) => architecture),
        }
      : null,
  });
}

export async function getCategories() {
  const counts = new Map<string, number>();
  const slugs = new Set<string>();

  for (const app of await getApps()) {
    for (const name of app.categories) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const categories = [...counts]
    .map(([id, count]) => ({
      id,
      name: categoryName(id),
      slug: categorySlug(id),
      count,
      url: sitePath(`/api/v1/categories/${id}.json`),
      webUrl: sitePath(`/categories/${categorySlug(id)}/`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const category of categories) {
    if (slugs.has(category.slug)) {
      throw new Error(`Duplicate category URL slug: ${category.slug}`);
    }

    slugs.add(category.slug);
  }

  return z.array(apiCategorySchema).parse(categories);
}

export async function getCategory(id: string) {
  const category = (await getCategories()).find((item) => item.id === id);

  if (!category) {
    return undefined;
  }

  return apiCategoryDetailsSchema.parse({
    ...category,
    apps: (await getApiApps())
      .filter((app) => app.categories.includes(category.id))
      .map(appSummary),
  });
}

export async function getNewApps(now = new Date()) {
  return apiNewAppsSchema.parse({
    windowDays: newAppWindowDays,
    apps: newApps(await getApiApps(), now).map(appSummary),
  });
}

export async function getUpdatedApps() {
  const apps = (await getApiApps())
    .filter((app) => app.releases[0] && !app.deprecated)
    .sort(
      (left, right) =>
        Date.parse(right.releases[0]!.publishedAt) - Date.parse(left.releases[0]!.publishedAt) ||
        left.name.localeCompare(right.name)
    );

  return apiUpdatedAppsSchema.parse({ apps: apps.map(appSummary) });
}

export async function getRanking(period: RankingPeriod) {
  const days = period === "week" ? 7 : period === "month" ? 30 : undefined;
  const counts = downloadCounts(await getDownloadHistory(), days);
  const apps = await getApiApps();
  const entries = counts
    ? apps
        .flatMap((app) => {
          const downloads = counts[app.id];

          return downloads === undefined ? [] : [{ app: appSummary(app), downloads }];
        })
        .sort(
          (left, right) =>
            right.downloads - left.downloads || left.app.name.localeCompare(right.app.name)
        )
    : null;

  return apiRankingSchema.parse({ period, entries });
}

export async function getArchitectures() {
  const counts = new Map<string, number>();

  for (const app of await getApiApps()) {
    for (const architecture of new Set(
      app.releases[0]?.artifacts.map((artifact) => artifact.architecture) ?? []
    )) {
      counts.set(architecture, (counts.get(architecture) ?? 0) + 1);
    }
  }

  return z.array(apiArchitectureSchema).parse(
    [...counts]
      .map(([id, count]) => ({
        id,
        count,
        url: sitePath(`/api/v1/architectures/${id}.json`),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

export async function getArchitecture(id: string) {
  const architecture = (await getArchitectures()).find((item) => item.id === id);

  if (!architecture) {
    return undefined;
  }

  const apps = (await getApiApps()).filter((app) =>
    app.releases[0]?.artifacts.some(({ architecture }) => architecture === id)
  );

  return apiArchitectureDetailsSchema.parse({
    ...architecture,
    apps: apps.map(appSummary),
  });
}

export async function getApiMetadata() {
  const [apps, categories, architectures, history] = await Promise.all([
    getApiApps(),
    getCategories(),
    getArchitectures(),
    getDownloadHistory(),
  ]);

  return apiMetadataSchema.parse({
    version: "v1",
    generatedAt: new Date().toISOString(),
    downloadsUpdatedAt: latestDownloadDate(history),
    counts: {
      apps: apps.length,
      categories: categories.length,
      architectures: architectures.length,
    },
  });
}
