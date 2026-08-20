import { readFile } from "node:fs/promises";
import { downloadCounts, downloadHistorySchema } from "@catalog/downloads";
import { imageType, readApps, root } from "@catalog/core";
import { appSchema, releaseSchema } from "@catalog/schema";
import { categoryName, categorySlug } from "@/lib/categories";
import { newApps, newAppWindowDays } from "@/lib/new-apps";
import { z } from "zod";

const imageTypeSchema = z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]);

const apiScreenshotSchema = z
  .object({
    caption: z.string().min(1),
    license: z.string().min(1),
    source: z.url(),
    url: z.string().min(1),
    type: imageTypeSchema,
  })
  .strict();

const apiAppSchema = appSchema
  .omit({ assets: true, releaseSource: true, screenshots: true })
  .extend({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    icon: z
      .object({
        license: z.string().min(1),
        source: z.url(),
        url: z.string().min(1),
        type: imageTypeSchema,
      })
      .strict(),
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
  })
  .strict();

export const apiCategoryDetailsSchema = apiCategorySchema
  .omit({ count: true })
  .extend({ apps: z.array(apiAppSchema) })
  .strict();

const apiNewAppsSchema = z
  .object({ windowDays: z.number().int().positive(), apps: z.array(apiAppSchema) })
  .strict();

const rankingPeriodSchema = z.enum(["week", "month", "all-time"]);

export const apiRankingSchema = z
  .object({
    period: rankingPeriodSchema,
    entries: z
      .array(z.object({ app: apiAppSchema, downloads: z.number().int().nonnegative() }).strict())
      .nullable(),
  })
  .strict();

export type ApiApp = z.infer<typeof apiAppSchema>;
export type RankingPeriod = z.infer<typeof rankingPeriodSchema>;

const icons = import.meta.glob("/apps/*/icon.*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const screenshots = import.meta.glob("/apps/*/screenshot-*.*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

let appsPromise: Promise<ApiApp[]> | undefined;

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
          url: icons[`/apps/${slug}/${iconFile}`]!,
          type: imageType(iconFile),
        },
        screenshots: app.screenshots.map(({ file, ...screenshot }) => ({
          ...screenshot,
          url: screenshots[`/apps/${slug}/${file}`]!,
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

export async function getCategories() {
  const counts = new Map<string, number>();
  const slugs = new Set<string>();

  for (const app of await getApps()) {
    for (const name of app.categories) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const categories = [...counts]
    .map(([id, count]) => ({ id, name: categoryName(id), slug: categorySlug(id), count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const category of categories) {
    if (slugs.has(category.slug)) throw new Error(`Duplicate category URL slug: ${category.slug}`);
    slugs.add(category.slug);
  }

  return z.array(apiCategorySchema).parse(categories);
}

export async function getCategory(slug: string) {
  const category = (await getCategories()).find((item) => item.slug === slug);

  if (!category) return undefined;

  return apiCategoryDetailsSchema.parse({
    id: category.id,
    name: category.name,
    slug,
    apps: (await getApps()).filter((app) => app.categories.includes(category.id)),
  });
}

export async function getNewApps(now = new Date()) {
  return apiNewAppsSchema.parse({
    windowDays: newAppWindowDays,
    apps: newApps(await getApps(), now),
  });
}

export async function getRanking(period: RankingPeriod) {
  const data = JSON.parse(await readFile(new URL("catalog/downloads.json", root), "utf8"));
  const history = downloadHistorySchema.parse(data);
  const days = period === "week" ? 7 : period === "month" ? 30 : undefined;
  const counts = downloadCounts(history, days);
  const apps = await getApps();
  const entries = counts
    ? apps
        .flatMap((app) => {
          const downloads = counts[app.id];

          return downloads === undefined ? [] : [{ app, downloads }];
        })
        .sort(
          (left, right) =>
            right.downloads - left.downloads || left.app.name.localeCompare(right.app.name)
        )
    : null;

  return apiRankingSchema.parse({ period, entries });
}
