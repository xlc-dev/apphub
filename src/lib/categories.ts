export function categorySlug(category: string) {
  const slug = category
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
