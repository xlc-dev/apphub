import {
  apiAppSummary,
  getApiArchitecture,
  getApiArchitectures,
  getApiCategories,
  getApiCategory,
  getApiApps,
  getApiMetadata,
} from "#lib/api-resources";
import { getAppSummaries, getNewApps, getRanking, getUpdatedApps } from "#lib/catalog-queries";
import { getCatalogSnapshot } from "#lib/catalog-loader";
import type { RankingPeriod } from "#lib/catalog-model";
import {
  apiAppDetailSchema,
  apiArchitectureListSchema,
  apiCategoryListSchema,
  apiFilteredPageSchema,
  apiMetadataV1Schema,
  apiNewPageSchema,
  apiRankingPageSchema,
  apiSummaryPageSchema,
  type ApiPagination,
  type ApiSnapshot,
  type ApiAppSummary,
} from "#lib/api-v1-schema";
import { facetResourcePath, type FacetType } from "#lib/facets";
import { sitePath } from "#lib/paths";

const apiPageSize = 50;

function apiPagePath(basePath: string, page: number) {
  return sitePath(page === 1 ? basePath : `${basePath.replace(/\.json$/, "")}/page/${page}.json`);
}

function pagination(totalItems: number, requestedPage: number, basePath: string): ApiPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / apiPageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);

  return {
    page,
    pageSize: apiPageSize,
    totalItems,
    totalPages,
    previous: page > 1 ? apiPagePath(basePath, page - 1) : null,
    next: page < totalPages ? apiPagePath(basePath, page + 1) : null,
  };
}

function pageItems<T>(items: T[], requestedPage: number, basePath: string) {
  const state = pagination(items.length, requestedPage, basePath);
  const start = (state.page - 1) * state.pageSize;

  return { pagination: state, items: items.slice(start, start + state.pageSize) };
}

export function apiExtraPagePaths(totalItems: number) {
  const pages = Math.ceil(totalItems / apiPageSize);

  return Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({
    params: { page: String(index + 2) },
    props: { page: index + 2 },
  }));
}

function getApiSnapshot(): ApiSnapshot {
  return getCatalogSnapshot();
}

export async function getApiAppPage(page = 1) {
  const apps = await getAppSummaries();

  return apiSummaryPageSchema.parse({
    ...getApiSnapshot(),
    ...pageItems(apps.map(apiAppSummary), page, "/api/v1/apps.json"),
  });
}

export async function getApiAppDetail(id: string) {
  const apps = await getApiApps();
  const resource = apps.find((app) => app.id === id);

  if (!resource) return undefined;

  return apiAppDetailSchema.parse({
    ...getApiSnapshot(),
    app: resource,
  });
}

const apiFacetReaders = {
  category: getApiCategory,
  architecture: getApiArchitecture,
} satisfies Record<FacetType, (id: string) => Promise<{ apps: ApiAppSummary[] } | undefined>>;

export async function getApiFacetPage(type: FacetType, id: string, page = 1) {
  const facet = await apiFacetReaders[type](id);

  if (!facet) return undefined;

  return apiFilteredPageSchema.parse({
    ...getApiSnapshot(),
    filter: { type, id },
    ...pageItems(facet.apps, page, facetResourcePath(type, id)),
  });
}

export async function getApiNewPage(page = 1) {
  const collection = await getNewApps();

  return apiNewPageSchema.parse({
    ...getApiSnapshot(),
    windowDays: collection.windowDays,
    ...pageItems(collection.apps.map(apiAppSummary), page, "/api/v1/new.json"),
  });
}

export async function getApiUpdatedPage(page = 1) {
  const collection = await getUpdatedApps();

  return apiSummaryPageSchema.parse({
    ...getApiSnapshot(),
    ...pageItems(collection.apps.map(apiAppSummary), page, "/api/v1/updated.json"),
  });
}

export async function getApiRankingPage(period: RankingPeriod, page = 1) {
  const collection = await getRanking(period);

  return apiRankingPageSchema.parse({
    ...getApiSnapshot(),
    period,
    ...(collection.entries === null
      ? { pagination: null, items: null }
      : pageItems(
          collection.entries.map(({ app, downloads }) => ({
            app: apiAppSummary(app),
            downloads,
          })),
          page,
          `/api/v1/trending/${period}.json`
        )),
  });
}

export async function getApiCategoryList() {
  return apiCategoryListSchema.parse({
    ...getApiSnapshot(),
    items: await getApiCategories(),
  });
}

export async function getApiArchitectureList() {
  return apiArchitectureListSchema.parse({
    ...getApiSnapshot(),
    items: await getApiArchitectures(),
  });
}

export async function getApiV1Metadata() {
  const metadata = await getApiMetadata();

  return apiMetadataV1Schema.parse({
    ...getApiSnapshot(),
    version: "v1",
    ...metadata,
  });
}
