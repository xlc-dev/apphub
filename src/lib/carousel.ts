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
    if (index === current) {
      dot.setAttribute("aria-current", "true");
    } else {
      dot.removeAttribute("aria-current");
    }
  });
}

interface CarouselControls {
  track: HTMLElement;
  slides: HTMLElement[];
  dots: HTMLAnchorElement[];
  previous?: HTMLButtonElement | null;
  next?: HTMLButtonElement | null;
}

export function connectCarousel({ track, slides, dots, previous, next }: CarouselControls) {
  let current = 0;

  const update = () => {
    current = currentSlide(track, slides);
    markCurrentSlide(dots, current);
  };

  previous?.addEventListener("click", () => showSlide(slides, current - 1));
  next?.addEventListener("click", () => showSlide(slides, current + 1));
  dots.forEach((dot, index) =>
    dot.addEventListener("click", (event) => {
      event.preventDefault();
      showSlide(slides, index);
    })
  );
  track.addEventListener("scroll", update, { passive: true });
  track.addEventListener("scrollend", update);
  update();
}
