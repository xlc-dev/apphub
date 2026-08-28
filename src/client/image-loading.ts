export function optimizeImageLoading(root: ParentNode = document, viewportHeight = innerHeight) {
  for (const image of root.querySelectorAll<HTMLImageElement>(
    'img[data-optimize-loading][loading="lazy"]'
  )) {
    const bounds = image.getBoundingClientRect();

    if (bounds.top < viewportHeight && bounds.bottom > 0) {
      image.loading = "eager";
    }
  }
}
