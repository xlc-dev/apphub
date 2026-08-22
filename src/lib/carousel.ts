export function currentSlide(track: HTMLElement, slides: HTMLElement[]) {
  return slides.reduce(
    (nearest, slide, index) =>
      Math.abs(track.scrollLeft - slide.offsetLeft) <
      Math.abs(track.scrollLeft - slides[nearest]!.offsetLeft)
        ? index
        : nearest,
    0
  );
}

export function showSlide(slides: HTMLElement[], index: number) {
  slides[(index + slides.length) % slides.length]?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "nearest",
    inline: "center",
  });
}

export function markCurrentSlide(dots: HTMLAnchorElement[], current: number) {
  dots.forEach((dot, index) => {
    if (index === current) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });
}
