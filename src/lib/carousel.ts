function currentSlide(track: HTMLElement, slides: HTMLElement[]) {
  let nearest = 0;

  for (const [index, slide] of slides.entries()) {
    const distance = Math.abs(track.scrollLeft - slide.offsetLeft);
    const nearestDistance = Math.abs(track.scrollLeft - slides[nearest]!.offsetLeft);

    if (distance < nearestDistance) {
      nearest = index;
    }
  }

  return nearest;
}

function showSlide(slides: HTMLElement[], index: number) {
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  slides[(index + slides.length) % slides.length]?.scrollIntoView({
    behavior,
    block: "nearest",
    inline: "center",
  });
}

function markCurrentSlide(choices: HTMLInputElement[], current: number) {
  choices.forEach((choice, index) => {
    choice.checked = index === current;
  });
}

interface CarouselControls {
  track: HTMLElement;
  slides: HTMLElement[];
  choices: HTMLInputElement[];
  previous?: HTMLButtonElement | null;
  next?: HTMLButtonElement | null;
}

export function connectCarousel({ track, slides, choices, previous, next }: CarouselControls) {
  let current = 0;

  const update = () => {
    current = currentSlide(track, slides);
    markCurrentSlide(choices, current);
  };

  previous?.addEventListener("click", () => showSlide(slides, current - 1));
  next?.addEventListener("click", () => showSlide(slides, current + 1));
  choices.forEach((choice, index) => {
    choice.addEventListener("change", () => {
      if (choice.checked) {
        showSlide(slides, index);
      }
    });
  });
  track.addEventListener("scroll", update, { passive: true });
  track.addEventListener("scrollend", update);
  update();
}
