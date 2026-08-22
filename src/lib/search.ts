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
  const words = value.split(/[^a-z0-9]+/).filter(Boolean);

  return (
    terms[0] === "" ||
    terms.every((term) => value.includes(term) || words.some((word) => isOrderedMatch(word, term)))
  );
}

function isOrderedMatch(value: string, query: string) {
  let index = 0;

  for (const character of value) {
    if (character === query[index]) index++;
    if (index === query.length) return true;
  }

  return false;
}
