import type { APIRoute } from "astro";
import { getApps } from "#lib/catalog-loader";
import { getCategories } from "#lib/catalog-queries";
import { isAppIndexable } from "#lib/catalog-model";
import { localePath } from "#lib/i18n";
import { locales } from "#lib/locales";
import { sitePath } from "#lib/paths";

const staticRoutes = [
  "/",
  "/apps/",
  "/new/",
  "/updated/",
  "/trending/",
  "/trending/month/",
  "/trending/all-time/",
  "/privacy/",
];
const maximumUrls = 40_000;

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error("Sitemap generation requires an Astro site URL");

  const [apps, categories] = await Promise.all([getApps(), getCategories()]);
  const routes = [
    ...staticRoutes,
    ...apps.filter(isAppIndexable).map(({ slug }) => `/apps/${slug}/`),
    ...categories.map(({ slug }) => `/categories/${slug}/`),
  ];
  const urls = locales
    .flatMap((locale) =>
      routes.map((route) => new URL(sitePath(localePath(route, locale)), site).href)
    )
    .sort();

  if (urls.length > maximumUrls) {
    throw new Error(`Sitemap contains ${urls.length} URLs; limit is ${maximumUrls}`);
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
