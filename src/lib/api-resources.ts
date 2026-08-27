import { latestDownloadDate } from "#catalog/downloads";
import { isStale, staleAfterDays, type RefreshState } from "#catalog/refresh";
import { getCatalogApps, getCatalogSnapshotTime, getDownloadHistory } from "#lib/catalog-loader";
import {
  getArchitecture,
  getArchitectures,
  getCategories,
  getCategory,
} from "#lib/catalog-queries";
import type { CatalogAppSummary } from "#lib/catalog-model";
import { facetResourcePath } from "#lib/facets";
import { sitePath } from "#lib/paths";
import type {
  ApiArchitecture,
  ApiArchitectureDetails,
  ApiAppResource,
  ApiAppSummary,
  ApiCategory,
  ApiCategoryDetails,
} from "#lib/api-v1-schema";

let resourcesPromise: Promise<ApiAppResource[]> | undefined;

async function loadApiApps(): Promise<ApiAppResource[]> {
  return (await getCatalogApps()).map(
    (app) =>
      ({
        ...app,
        url: sitePath(`/api/v1/apps/${app.id}.json`),
        webUrl: sitePath(`/apps/${app.slug}/`),
      }) satisfies ApiAppResource
  );
}

export function getApiApps() {
  return (resourcesPromise ??= loadApiApps());
}

export function apiAppSummary(app: CatalogAppSummary) {
  return {
    ...app,
    url: sitePath(`/api/v1/apps/${app.id}.json`),
    webUrl: sitePath(`/apps/${app.slug}/`),
  } satisfies ApiAppSummary;
}

export async function getApiCategories() {
  return (await getCategories()).map(
    (category) =>
      ({
        ...category,
        url: sitePath(facetResourcePath("category", category.id)),
        webUrl: sitePath(`/categories/${category.slug}/`),
      }) satisfies ApiCategory
  );
}

export async function getApiCategory(id: string) {
  const category = await getCategory(id);

  if (!category) return undefined;

  return {
    ...category,
    url: sitePath(facetResourcePath("category", category.id)),
    webUrl: sitePath(`/categories/${category.slug}/`),
    apps: category.apps.map(apiAppSummary),
  } satisfies ApiCategoryDetails;
}

export async function getApiArchitectures() {
  return (await getArchitectures()).map(
    (architecture) =>
      ({
        ...architecture,
        url: sitePath(facetResourcePath("architecture", architecture.id)),
      }) satisfies ApiArchitecture
  );
}

export async function getApiArchitecture(id: string) {
  const architecture = await getArchitecture(id);

  if (!architecture) return undefined;

  return {
    ...architecture,
    url: sitePath(facetResourcePath("architecture", architecture.id)),
    apps: architecture.apps.map(apiAppSummary),
  } satisfies ApiArchitectureDetails;
}

export async function getApiMetadata() {
  const [apps, categories, architectures, history] = await Promise.all([
    getCatalogApps(),
    getCategories(),
    getArchitectures(),
    getDownloadHistory(),
  ]);

  const statuses = { current: 0, stale: 0, unavailable: 0, quarantined: 0 };
  const incidents = { network: 0, rateLimit: 0, notFound: 0, invalidData: 0, integrity: 0 };
  let staleResources = 0;

  const addRefresh = (state: RefreshState | undefined, days: number) => {
    if (!state) return;

    if (isStale(state, days, getCatalogSnapshotTime())) staleResources++;

    const category = state.incident?.category;

    if (category === "network") incidents.network++;
    if (category === "rate-limit") incidents.rateLimit++;
    if (category === "not-found") incidents.notFound++;
    if (category === "invalid-data") incidents.invalidData++;
    if (category === "integrity") incidents.integrity++;
  };

  for (const app of apps) {
    statuses[app.status]++;
    addRefresh(app.provenance.refresh.metadata, staleAfterDays.metadata);
    addRefresh(app.provenance.refresh.releases, staleAfterDays.releases);
    addRefresh(app.statistics.refresh.downloads, staleAfterDays.statistics);
    addRefresh(app.statistics.refresh.stars, staleAfterDays.statistics);
  }

  return {
    freshness: {
      downloadsUpdatedAt: latestDownloadDate(history),
      staleResources,
      statuses,
      incidents,
    },
    counts: {
      apps: apps.length,
      categories: categories.length,
      architectures: architectures.length,
    },
  };
}
