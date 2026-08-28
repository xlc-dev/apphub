import { z } from "zod";
import { downloadCounts } from "#catalog/downloads";
import { localizeApp } from "#catalog/localization";
import { getCatalogApps, getCatalogSnapshotTime, getDownloadHistory } from "#lib/catalog-loader";
import {
  catalogAppSummarySchema,
  catalogArchitectureDetailsSchema,
  catalogArchitectureSchema,
  catalogCategoryDetailsSchema,
  catalogCategorySchema,
  catalogNewAppsSchema,
  catalogRankingSchema,
  catalogUpdatedAppsSchema,
  type CatalogAppResource,
  type CatalogAppSummary,
  type RankingPeriod,
} from "#lib/catalog-model";
import { facetItems, matchesFacet } from "#lib/facets";
import { newApps, newAppWindowDays } from "#lib/new-apps";

const collator = new Intl.Collator("en");

function appSummary(app: CatalogAppResource) {
  const latest = app.releases[0];

  return catalogAppSummarySchema.parse({
    id: app.id,
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    origin: app.origin.type,
    projectLicense: app.projectLicense,
    addedAt: app.addedAt,
    categories: app.categories,
    icon: app.icon,
    statistics: {
      stars: app.statistics.stars,
      downloads: app.statistics.downloads,
    },
    status: app.status,
    latestRelease: latest
      ? {
          version: latest.version,
          publishedAt: latest.publishedAt,
          architectures: latest.artifacts.map(({ architecture }) => architecture),
        }
      : null,
  });
}

export async function getAppSummaries() {
  return (await getCatalogApps()).map(appSummary);
}

export async function getLocalizedAppSummaries(locale: string) {
  const collator = new Intl.Collator(locale);

  return (await getCatalogApps())
    .map((app) => appSummary(localizeApp(app, locale)))
    .sort(
      (left, right) =>
        collator.compare(left.name, right.name) || collator.compare(left.slug, right.slug)
    );
}

export async function localizeAppSummaries(apps: CatalogAppSummary[], locale: string) {
  const catalog = new Map(
    (await getCatalogApps()).map((app) => [app.id, appSummary(localizeApp(app, locale))])
  );

  return apps.map((app) => {
    const localized = catalog.get(app.id);

    if (!localized) throw new Error(`Unknown application id: ${app.id}`);

    return localized;
  });
}

export async function getCategories() {
  return z.array(catalogCategorySchema).parse(facetItems(await getCatalogApps(), "category"));
}

export async function getCategory(id: string) {
  const category = (await getCategories()).find((item) => item.id === id);

  if (!category) return undefined;

  return catalogCategoryDetailsSchema.parse({
    ...category,
    apps: (await getCatalogApps())
      .filter((app) => matchesFacet(app, "category", category.id))
      .map(appSummary),
  });
}

export async function getNewApps(now = getCatalogSnapshotTime()) {
  return catalogNewAppsSchema.parse({
    windowDays: newAppWindowDays,
    apps: newApps(await getCatalogApps(), now).map(appSummary),
  });
}

export async function getUpdatedApps() {
  const apps = (await getCatalogApps())
    .filter((app) => app.releases[0])
    .sort(
      (left, right) =>
        Date.parse(right.releases[0]!.publishedAt) - Date.parse(left.releases[0]!.publishedAt) ||
        collator.compare(left.name, right.name) ||
        collator.compare(left.slug, right.slug)
    );

  return catalogUpdatedAppsSchema.parse({ apps: apps.map(appSummary) });
}

export async function getRanking(period: RankingPeriod) {
  const days = period === "week" ? 7 : period === "month" ? 30 : undefined;
  const counts = downloadCounts(await getDownloadHistory(), days);
  const apps = await getCatalogApps();
  const entries = counts
    ? apps
        .flatMap((app) => {
          const downloads = counts[app.id];

          return downloads === undefined ? [] : [{ app: appSummary(app), downloads }];
        })
        .sort(
          (left, right) =>
            right.downloads - left.downloads ||
            collator.compare(left.app.name, right.app.name) ||
            collator.compare(left.app.slug, right.app.slug)
        )
    : null;

  return catalogRankingSchema.parse({ period, entries });
}

export async function getArchitectures() {
  return z
    .array(catalogArchitectureSchema)
    .parse(facetItems(await getCatalogApps(), "architecture"));
}

export async function getArchitecture(id: string) {
  const architecture = (await getArchitectures()).find((item) => item.id === id);

  if (!architecture) return undefined;

  return catalogArchitectureDetailsSchema.parse({
    ...architecture,
    apps: (await getCatalogApps())
      .filter((app) => matchesFacet(app, "architecture", id))
      .map(appSummary),
  });
}
