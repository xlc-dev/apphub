export interface SearchableApp {
  name: string;
  summary: string;
  description: string;
  developer: { name: string };
  keywords?: string[] | undefined;
  categories: string[];
  mimeTypes?: string[] | undefined;
  source: "official" | "community";
}

export function catalogSearchValue(app: SearchableApp) {
  return [
    app.name,
    app.summary,
    app.description,
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
