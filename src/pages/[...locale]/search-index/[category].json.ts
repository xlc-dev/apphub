import type { APIRoute, GetStaticPaths } from "astro";
import { getApps } from "@/lib/catalog-loader";
import { getCategories } from "@/lib/catalog-queries";
import { getLocale } from "@/lib/i18n";
import { getRepositoryStars } from "@/lib/repository-stars";
import { searchIndexEntry } from "@/lib/search";
import { locales } from "@/lib/locales";
import { localizeApp } from "#catalog/localization";

export const getStaticPaths = (async () => {
  const categories = await getCategories();

  return locales.flatMap((locale) =>
    categories.map(({ id }) => ({
      params: { locale: locale === "en" ? undefined : locale, category: id },
    }))
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const locale = getLocale(params.locale);
  const category = params.category;
  const collator = new Intl.Collator(locale);
  const [apps, stars] = await Promise.all([getApps(), getRepositoryStars()]);

  return Response.json(
    apps
      .filter((app) => app.categories.includes(category ?? ""))
      .map((app) => searchIndexEntry(localizeApp(app, locale), stars[app.slug]))
      .sort(
        (left, right) =>
          collator.compare(left.name, right.name) || collator.compare(left.slug, right.slug)
      ),
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
};
