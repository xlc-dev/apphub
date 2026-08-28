import type { APIRoute, GetStaticPaths } from "astro";
import { getApps } from "@/lib/catalog-loader";
import { getLocale } from "@/lib/i18n";
import { getRepositoryStars } from "@/lib/repository-stars";
import { searchIndexEntry } from "@/lib/search";
import { localePaths } from "@/lib/static-pages";
import { localizeApp } from "#catalog/localization";

export const getStaticPaths = (() => localePaths()) satisfies GetStaticPaths;

async function searchIndex(locale: string) {
  const collator = new Intl.Collator(locale);
  const [apps, stars] = await Promise.all([getApps(), getRepositoryStars()]);

  return apps
    .map((app) => searchIndexEntry(localizeApp(app, locale), stars[app.slug]))
    .sort(
      (left, right) =>
        collator.compare(left.name, right.name) || collator.compare(left.slug, right.slug)
    );
}

export const GET: APIRoute = async ({ params }) =>
  Response.json(await searchIndex(getLocale(params.locale)), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
