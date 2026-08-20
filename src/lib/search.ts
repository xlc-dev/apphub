export interface SearchableApp {
  name: string;
  summary: string;
  description: string;
  categories: string[];
  source: "official" | "community";
}

export function catalogSearchValue(app: SearchableApp) {
  return [app.name, app.summary, app.description, app.source, ...app.categories]
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(value: string, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/);

  return terms[0] === "" || terms.every((term) => value.includes(term));
}
