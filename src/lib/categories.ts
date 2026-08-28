import type { Locale } from "#lib/locales";

const categoryNames: Record<string, string> = {
  AudioVideo: "Audio & Video",
};

const dutchCategoryNames: Record<string, string> = {
  "2DGraphics": "2D-graphics",
  Audio: "Audio",
  AudioVideo: "Audio en video",
  Calculator: "Rekenmachine",
  Development: "Ontwikkeling",
  DiscBurning: "Schijven branden",
  Education: "Onderwijs",
  Emulator: "Emulator",
  Engineering: "Techniek",
  Feed: "Feeds",
  Game: "Spellen",
  Graphics: "Grafisch",
  GTK: "GTK",
  GNOME: "GNOME",
  Music: "Muziek",
  Monitor: "Systeemmonitoring",
  Network: "Netwerk",
  Office: "Kantoor",
  RasterGraphics: "Rasterafbeeldingen",
  Science: "Wetenschap",
  Security: "Beveiliging",
  System: "Systeem",
  TextEditor: "Teksteditor",
  Utility: "Hulpmiddelen",
  VectorGraphics: "Vectorafbeeldingen",
  Video: "Video",
  WebDevelopment: "Webontwikkeling",
  ConsoleOnly: "Alleen terminal",
};

const localizedCategoryNames: Partial<Record<Locale, Record<string, string>>> = {
  nl: dutchCategoryNames,
};

export function categoryName(category: string, locale: Locale = "en") {
  return (
    localizedCategoryNames[locale]?.[category] ??
    categoryNames[category] ??
    category.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}

export function localizeCategories<T extends { id: string; name: string }>(
  categories: T[],
  locale: Locale
) {
  return categories.map((category) => ({ ...category, name: categoryName(category.id, locale) }));
}

export function categorySlug(category: string) {
  const slug = categoryName(category)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new Error(`Category has no usable URL slug: ${category}`);
  }

  return slug;
}

export function categoryPath(category: string) {
  return `/categories/${categorySlug(category)}/`;
}
