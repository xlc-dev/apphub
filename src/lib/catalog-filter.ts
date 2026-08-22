import { matchesSearch } from "@/lib/search";

export function matchesCategories(categories: readonly string[], selected: ReadonlySet<string>) {
  return selected.size === 0 || categories.some((category) => selected.has(category));
}

export function catalogMatchState(
  searchValue: string,
  query: string,
  categories: readonly string[],
  selected: ReadonlySet<string>
) {
  const search = matchesSearch(searchValue, query);
  const category = matchesCategories(categories, selected);

  return { search, category, match: search && category };
}
