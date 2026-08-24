import type { DescriptionBlock } from "#catalog/schema";

export interface SearchableApp {
  name: string;
  summary: string;
  description: DescriptionBlock[];
  developer: { name: string };
  keywords?: string[] | undefined;
  categories: string[];
  mimeTypes?: string[] | undefined;
  source: "official" | "community";
}

export function catalogSearchValue(app: SearchableApp) {
  const description = app.description.flatMap((block) =>
    block.type === "paragraph" ? block.content : block.items.flat()
  );

  return [
    app.name,
    app.summary,
    ...description.map(({ value }) => value),
    app.developer.name,
    app.source,
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
