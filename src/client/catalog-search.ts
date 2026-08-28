import { categoryName } from "#lib/categories";
import { getLocale, localePath, translate, type Locale } from "#lib/i18n";
import { sitePath } from "#lib/paths";
import {
  catalogFilterParameters,
  searchCardSelectors,
  searchPage,
  type CatalogFilters,
  type SearchIndexEntry,
} from "#lib/search";

function isCatalogHistoryState(value: unknown): value is { apphubCatalog: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "apphubCatalog" in value &&
    value.apphubCatalog === true
  );
}

function appCard(app: SearchIndexEntry, template: HTMLTemplateElement, locale: Locale) {
  const article = template.content.firstElementChild?.cloneNode(true);

  if (!(article instanceof HTMLElement)) throw new Error("Search card template is empty");

  const link = article.querySelector<HTMLAnchorElement>(searchCardSelectors.link);
  const icon = article.querySelector<HTMLImageElement>(searchCardSelectors.icon);
  const name = article.querySelector<HTMLElement>(searchCardSelectors.name);
  const summary = article.querySelector<HTMLElement>(searchCardSelectors.summary);
  const origin = article.querySelector<HTMLElement>(searchCardSelectors.origin);
  const originLabel = article.querySelector<HTMLElement>(searchCardSelectors.originLabel);
  const categories = article.querySelector<HTMLElement>(searchCardSelectors.categories);
  const categoryCount = article.querySelector<HTMLElement>(searchCardSelectors.categoryCount);
  const stars = article.querySelector<HTMLElement>(searchCardSelectors.stars);
  const starCount = article.querySelector<HTMLElement>(searchCardSelectors.starCount);

  if (
    !link ||
    !icon ||
    !name ||
    !summary ||
    !origin ||
    !originLabel ||
    !categories ||
    !categoryCount ||
    !stars ||
    !starCount
  ) {
    throw new Error("Search card template is incomplete");
  }

  const hiddenCategories = Math.max(0, app.categories.length - 2);

  link.href = sitePath(localePath(`/apps/${app.slug}/`, locale));
  icon.src = app.icon.url;
  name.textContent = app.name;
  summary.textContent = app.summary;
  origin.dataset.originBadge = app.origin;
  originLabel.textContent = translate(
    locale,
    app.origin === "upstream" ? "origin.upstream" : "origin.thirdParty"
  );
  categories.textContent = app.categories
    .slice(0, 2)
    .map((category) => categoryName(category, locale))
    .join(", ");
  categoryCount.textContent = `, +${hiddenCategories}`;
  categoryCount.hidden = hiddenCategories === 0;
  stars.hidden = app.stars === undefined;
  if (app.stars !== undefined) {
    stars.setAttribute(
      "aria-label",
      translate(locale, "stars.repository", { count: app.stars.toLocaleString(locale) })
    );
    starCount.textContent = app.stars.toLocaleString(locale);
  }

  return article;
}

function pageLink(page: number, label: string) {
  const link = document.createElement("a");
  const url = new URL(location.href);

  url.searchParams.set("page", String(page));

  link.href = url.toString();
  link.className =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--control-bg)] px-4 text-sm font-medium shadow-sm hover:bg-[var(--card-raised)]";
  link.textContent = label;

  return link;
}

export function initializeCatalogSearch() {
  const form = document.querySelector<HTMLFormElement>("[data-catalog-search]");

  if (!form || form.dataset.initialized) return;

  const input = form.querySelector<HTMLInputElement>("[data-catalog-search-input]");
  const status = form.querySelector<HTMLElement>("[data-search-status]");
  const results = document.querySelector<HTMLElement>("[data-catalog-results]");
  const empty = document.querySelector<HTMLElement>("[data-search-empty]");
  const pagination = document.querySelector<HTMLElement>("[data-search-pagination]");
  const cardTemplate = document.querySelector<HTMLTemplateElement>("[data-search-card-template]");
  const filterInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-catalog-filter]")
  );
  const clearButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-clear-filters]")
  );
  const filterControls = Array.from(
    document.querySelectorAll<HTMLElement>("[data-catalog-filter-controls]")
  );
  const filterMenus = Array.from(
    document.querySelectorAll<HTMLDetailsElement>("[data-filter-menu]")
  );
  const visibleStatus = document.querySelector<HTMLElement>("[data-visible-filter-status]");

  if (!input || !status || !results || !empty || !pagination || !cardTemplate) return;

  const locale = getLocale(document.documentElement.lang);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, unknown>) =>
    translate(locale, key, values);
  let index: SearchIndexEntry[] | undefined;
  const currentCategory = results.dataset.currentCategory;
  const catalogPath = results.dataset.catalogPath ?? location.pathname;
  history.replaceState({ ...(history.state ?? {}), apphubCatalog: true }, "");
  const allowedFilters = new Set(filterInputs.map(({ name, value }) => `${name}\0${value}`));

  const filterValues = (url: URL, parameter: string) => [
    ...new Set(
      url.searchParams
        .getAll(parameter)
        .filter((value) => allowedFilters.has(`${parameter}\0${value}`))
    ),
  ];

  const filtersFromUrl = (url: URL): CatalogFilters => ({
    categories: currentCategory ? [currentCategory] : [],
    architecture: filterValues(url, "architecture"),
    compatibility: filterValues(url, "compatibility"),
    origin: filterValues(url, "origin"),
    license: filterValues(url, "license"),
    interface: filterValues(url, "interface"),
    display: filterValues(url, "display"),
    network: filterValues(url, "network"),
    filesystem: filterValues(url, "filesystem"),
    location: filterValues(url, "location"),
    audio: filterValues(url, "audio"),
    process: filterValues(url, "process"),
    host: filterValues(url, "host"),
    device: filterValues(url, "device"),
    portal: filterValues(url, "portal"),
  });

  const syncControls = (url: URL) => {
    for (const input of filterInputs) {
      input.checked = url.searchParams.getAll(input.name).includes(input.value);
    }

    const hasFilters = catalogFilterParameters.some(
      (parameter) => filterValues(url, parameter).length > 0
    );

    for (const button of clearButtons) button.disabled = !hasFilters;

    for (const menu of filterMenus) {
      const count = menu.querySelector<HTMLElement>("[data-filter-count]");
      const selected = new Set(
        Array.from(menu.querySelectorAll<HTMLInputElement>("[data-catalog-filter]:checked")).map(
          ({ name, value }) => `${name}\0${value}`
        )
      ).size;

      if (count) {
        count.textContent = String(selected);
        count.classList.toggle("invisible", selected === 0);
      }
    }

    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-category-link]")) {
      const destination = new URL(link.href);

      for (const parameter of ["q", ...catalogFilterParameters]) {
        destination.searchParams.delete(parameter);
        for (const value of url.searchParams.getAll(parameter)) {
          destination.searchParams.append(parameter, value);
        }
      }

      destination.searchParams.delete("page");
      link.href = destination.toString();
    }
  };

  form.dataset.initialized = "true";
  for (const controls of filterControls) {
    controls.classList.remove("invisible");
    controls.inert = false;
    controls.removeAttribute("aria-hidden");
  }

  const filter = async () => {
    const query = input.value.trim();
    const url = new URL(location.href);

    if (url.pathname !== catalogPath) {
      url.pathname = catalogPath;
      history.replaceState(null, "", url);
    }

    const filters = filtersFromUrl(url);
    const staticPagination = document.querySelector<HTMLElement>("[data-static-pagination]");

    index ??= (await fetch(sitePath(localePath("/search-index.json", locale))).then((response) => {
      if (!response.ok) throw new Error(t("search.failed", { status: response.status }));

      return response.json();
    })) as SearchIndexEntry[];

    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const page = searchPage(index, query, filters, requestedPage);
    const grid = document.createElement("div");

    grid.className = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
    grid.append(...page.apps.map((app) => appCard(app, cardTemplate, locale)));
    results.replaceChildren(grid);

    const pageStatus = document.createElement("span");

    pageStatus.className = "min-w-24 text-center text-sm text-[var(--muted)]";
    pageStatus.textContent = t("pagination.page", page);
    pagination.replaceChildren(
      ...(page.page > 1 ? [pageLink(page.page - 1, t("pagination.previous"))] : []),
      pageStatus,
      ...(page.page < page.pages ? [pageLink(page.page + 1, t("pagination.next"))] : [])
    );
    pagination.hidden = page.pages <= 1;

    empty.hidden = page.total !== 0;
    if (staticPagination) staticPagination.hidden = true;
    status.textContent = t(page.total === 1 ? "apps.appFound" : "apps.appsFound", {
      count: page.total,
    });
    if (visibleStatus) visibleStatus.textContent = status.textContent;
  };

  const runFilter = () => {
    void filter().catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : String(error);
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const url = new URL(location.href);

    url.pathname = catalogPath;
    if (input.value.trim()) url.searchParams.set("q", input.value.trim());
    else url.searchParams.delete("q");
    url.searchParams.delete("page");
    history.pushState({ ...(history.state ?? {}), apphubCatalog: true }, "", url);
    syncControls(url);
    runFilter();
  });

  for (const filterInput of filterInputs) {
    filterInput.addEventListener("change", () => {
      const url = new URL(location.href);
      const selected = new Set(filterValues(url, filterInput.name));

      url.pathname = catalogPath;
      if (filterInput.checked) selected.add(filterInput.value);
      else selected.delete(filterInput.value);

      url.searchParams.delete(filterInput.name);
      for (const input of filterInputs) {
        if (input.name === filterInput.name && selected.delete(input.value)) {
          url.searchParams.append(input.name, input.value);
        }
      }

      url.searchParams.delete("page");
      history.pushState({ ...(history.state ?? {}), apphubCatalog: true }, "", url);
      syncControls(url);
      runFilter();
    });
  }

  for (const button of clearButtons) {
    button.addEventListener("click", () => {
      const url = new URL(location.href);

      url.pathname = catalogPath;
      for (const parameter of catalogFilterParameters) url.searchParams.delete(parameter);
      url.searchParams.delete("page");
      history.pushState({ ...(history.state ?? {}), apphubCatalog: true }, "", url);
      syncControls(url);
      runFilter();
    });
  }

  for (const menu of filterMenus) {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;

      for (const other of filterMenus) {
        if (other !== menu) other.open = false;
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof Node && !filterMenus.some((menu) => menu.contains(target))) {
      for (const menu of filterMenus) menu.open = false;
    }
  });

  window.addEventListener(
    "popstate",
    (event) => {
      if (!isCatalogHistoryState(event.state) || location.pathname !== catalogPath) return;

      event.stopImmediatePropagation();
      const url = new URL(location.href);

      input.value = url.searchParams.get("q") ?? "";
      syncControls(url);
      runFilter();
    },
    { capture: true }
  );

  const url = new URL(location.href);

  input.value = url.searchParams.get("q") ?? "";
  syncControls(url);
  if (
    input.value ||
    catalogFilterParameters.some((parameter) => filterValues(url, parameter).length > 0)
  ) {
    runFilter();
  }
}
