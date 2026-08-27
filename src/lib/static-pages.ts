import {
  getAppSummaries,
  getCategories,
  getNewApps,
  getRanking,
  getUpdatedApps,
  type RankingPeriod,
} from "#lib/catalog-queries";
import { catalogPageSize } from "#lib/pagination";
import { locales } from "#lib/locales";

interface StaticPath {
  params: Record<string, string>;
  props?: Record<string, unknown>;
}

export function localePaths<T extends StaticPath = { params: Record<string, string> }>(
  paths: T[] = [{ params: {} }] as T[]
) {
  return locales.flatMap((locale) =>
    paths.map((path) => ({ ...path, params: { locale, ...path.params } }))
  );
}

function paginationPaths(total: number) {
  const pages = Math.ceil(total / catalogPageSize);

  return Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({
    params: { page: String(index + 2) },
    props: { page: index + 2 },
  }));
}

export async function newAppPagePaths() {
  return paginationPaths((await getNewApps()).apps.length);
}

export async function updatedAppPagePaths() {
  return paginationPaths((await getUpdatedApps()).apps.length);
}

export async function rankingPagePaths(period: RankingPeriod) {
  return paginationPaths((await getRanking(period)).entries?.length ?? 0);
}

export async function categoryPagePaths() {
  const apps = await getAppSummaries();
  const categories = await getCategories();

  return categories.flatMap(({ id, name, slug }) =>
    paginationPaths(apps.filter((app) => app.categories.includes(id)).length).map(
      ({ params, props }) => ({
        params: { category: slug, ...params },
        props: { category: id, categoryName: name, ...props },
      })
    )
  );
}
