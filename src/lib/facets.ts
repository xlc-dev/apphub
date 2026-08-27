import { categoryName, categorySlug } from "#lib/categories";

const collator = new Intl.Collator("en");

export const facetTypes = ["category", "architecture"] as const;
export type FacetType = (typeof facetTypes)[number];

interface FacetApp {
  categories: string[];
  releases: Array<{ artifacts: Array<{ architecture: string }> }>;
}

interface FacetItem {
  id: string;
  count: number;
  name?: string;
  slug?: string;
}

const facetDefinitions = {
  category: {
    collection: "categories",
    values: (app: FacetApp) => app.categories,
    item: (id: string, count: number) => {
      const slug = categorySlug(id);

      return {
        id,
        name: categoryName(id),
        slug,
        count,
      };
    },
    compare: (left: FacetItem, right: FacetItem) =>
      collator.compare(left.name!, right.name!) || collator.compare(left.id, right.id),
    unique: (item: FacetItem) => item.slug!,
  },
  architecture: {
    collection: "architectures",
    values: (app: FacetApp) =>
      app.releases[0]?.artifacts.map(({ architecture }) => architecture) ?? [],
    item: (id: string, count: number) => ({ id, count }),
    compare: (left: FacetItem, right: FacetItem) => collator.compare(left.id, right.id),
  },
} satisfies Record<
  FacetType,
  {
    collection: string;
    values: (app: FacetApp) => string[];
    item: (id: string, count: number) => FacetItem;
    compare: (left: FacetItem, right: FacetItem) => number;
    unique?: (item: FacetItem) => string;
  }
>;

export function facetCounts(apps: FacetApp[], type: FacetType) {
  const counts = new Map<string, number>();

  for (const app of apps) {
    for (const value of new Set(facetDefinitions[type].values(app))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return counts;
}

export function matchesFacet(app: FacetApp, type: FacetType, value: string) {
  return facetDefinitions[type].values(app).includes(value);
}

export function facetResourcePath(type: FacetType, value: string) {
  return `/api/v1/${facetDefinitions[type].collection}/${value}.json`;
}

export function facetItems(apps: FacetApp[], type: FacetType) {
  const definition = facetDefinitions[type];
  const items = [...facetCounts(apps, type)]
    .map(([id, count]) => definition.item(id, count))
    .sort(definition.compare);
  const unique = "unique" in definition ? definition.unique : undefined;

  if (unique) {
    const keys = new Set<string>();

    for (const item of items) {
      const key = unique(item);

      if (keys.has(key)) {
        throw new Error(`Duplicate ${type} URL key: ${key}`);
      }

      keys.add(key);
    }
  }

  return items;
}
