const categoryNames: Record<string, string> = {
  AudioVideo: "Audio & Video",
};

export function categoryName(category: string) {
  return (
    categoryNames[category] ??
    category.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}

export function categorySlug(category: string) {
  const slug = categoryName(category)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) throw new Error(`Category has no usable URL slug: ${category}`);

  return slug;
}

export function categoryPath(category: string) {
  return `/categories/${categorySlug(category)}`;
}
