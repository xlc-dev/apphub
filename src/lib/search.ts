import type { DescriptionBlock } from "#catalog/schema";
import type { CatalogApp } from "#lib/catalog-loader";
import { catalogPageSize, paginationState } from "#lib/pagination";

interface SearchableApp {
  name: string;
  summary: string;
  description: DescriptionBlock[];
  developer: { name: string };
  keywords?: string[] | undefined;
  categories: string[];
  mimeTypes?: string[] | undefined;
  origin: { type: "upstream" | "third-party" };
}

export interface SearchIndexEntry {
  slug: string;
  name: string;
  summary: string;
  origin: "upstream" | "third-party";
  categories: string[];
  icon: { url: string };
  value: string;
}

export const searchCardSelectors = {
  link: "[data-app-card-link]",
  icon: "[data-app-card-icon]",
  name: "[data-app-card-name]",
  summary: "[data-app-card-summary]",
  origin: "[data-origin-badge]",
  originLabel: "[data-origin-label]",
  categories: "[data-app-card-categories]",
  categoryCount: "[data-app-card-category-count]",
} as const;

export function catalogSearchValue(app: SearchableApp) {
  const description = app.description.flatMap((block) =>
    block.type === "paragraph" ? block.content : block.items.flat()
  );

  return [
    app.name,
    app.summary,
    ...description.map(({ value }) => value),
    app.developer.name,
    app.origin.type,
    ...app.categories,
    ...(app.keywords ?? []),
    ...(app.mimeTypes ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(value: string, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/);

  return terms[0] === "" || terms.every((term) => value.includes(term));
}

export function searchPage(
  index: SearchIndexEntry[],
  query: string,
  requestedPage: number,
  pageSize = catalogPageSize
) {
  const matches = index.filter((app) => matchesSearch(app.value, query));
  const state = paginationState(matches.length, requestedPage, pageSize);

  return {
    apps: matches.slice(state.start, state.end),
    page: state.page,
    pages: state.pages,
    total: matches.length,
  };
}

export function searchIndexEntry(app: CatalogApp): SearchIndexEntry {
  return {
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    origin: app.origin.type,
    categories: app.categories,
    icon: { url: app.icon.url },
    value: catalogSearchValue(app),
  };
}
