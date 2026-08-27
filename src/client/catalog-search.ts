import { categoryName } from "#lib/categories";
import { getLocale, localePath, translate, type Locale } from "#lib/i18n";
import { sitePath } from "#lib/paths";
import { searchCardSelectors, searchPage, type SearchIndexEntry } from "#lib/search";

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

  if (
    !link ||
    !icon ||
    !name ||
    !summary ||
    !origin ||
    !originLabel ||
    !categories ||
    !categoryCount
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

  return article;
}

function pageLink(query: string, page: number, label: string, locale: Locale) {
  const link = document.createElement("a");
  const url = new URL(sitePath(localePath("/apps/", locale)), location.origin);

  url.searchParams.set("q", query);
  if (page > 1) url.searchParams.set("page", String(page));

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

  if (!input || !status || !results || !empty || !pagination || !cardTemplate) return;

  const locale = getLocale(document.documentElement.lang);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, unknown>) =>
    translate(locale, key, values);
  let index: SearchIndexEntry[] | undefined;

  form.dataset.initialized = "true";
  form.hidden = false;

  const filter = async () => {
    const query = input.value.trim();
    const staticPagination = document.querySelector<HTMLElement>("[data-static-pagination]");

    if (!query) {
      location.href = sitePath(localePath("/apps/", locale));
      return;
    }

    index ??= (await fetch(sitePath(localePath("/search-index.json", locale))).then((response) => {
      if (!response.ok) throw new Error(t("search.failed", { status: response.status }));

      return response.json();
    })) as SearchIndexEntry[];

    const requestedPage = Number(new URL(location.href).searchParams.get("page") ?? "1");
    const page = searchPage(index, query, requestedPage);
    const grid = document.createElement("div");

    grid.className = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
    grid.append(...page.apps.map((app) => appCard(app, cardTemplate, locale)));
    results.replaceChildren(grid);

    const pageStatus = document.createElement("span");

    pageStatus.className = "min-w-24 text-center text-sm text-[var(--muted)]";
    pageStatus.textContent = t("pagination.page", page);
    pagination.replaceChildren(
      ...(page.page > 1 ? [pageLink(query, page.page - 1, t("pagination.previous"), locale)] : []),
      pageStatus,
      ...(page.page < page.pages
        ? [pageLink(query, page.page + 1, t("pagination.next"), locale)]
        : [])
    );
    pagination.hidden = page.pages <= 1;

    empty.hidden = page.total !== 0;
    if (staticPagination) staticPagination.hidden = true;
    status.textContent = t(page.total === 1 ? "apps.appFound" : "apps.appsFound", {
      count: page.total,
    });
  };

  const runFilter = () => {
    void filter().catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : String(error);
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const url = new URL(sitePath(localePath("/apps/", locale)), location.origin);

    if (input.value.trim()) url.searchParams.set("q", input.value.trim());
    history.pushState(null, "", url);
    runFilter();
  });

  window.addEventListener("popstate", () => {
    input.value = new URL(location.href).searchParams.get("q") ?? "";
    runFilter();
  });

  input.value = new URL(location.href).searchParams.get("q") ?? "";
  if (input.value) runFilter();
}
