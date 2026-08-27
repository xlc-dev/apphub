import type { APIRoute } from "astro";
import { sitePath } from "#lib/paths";

const searchCrawlers = [
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "YandexBot",
  "Baiduspider",
  "MojeekBot",
];

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("robots.txt generation requires an Astro site URL");

  const root = sitePath("/");
  const api = sitePath("/api/");
  const body = [
    "User-agent: *",
    `Disallow: ${root}`,
    "",
    ...searchCrawlers.flatMap((crawler) => [
      `User-agent: ${crawler}`,
      `Allow: ${root}`,
      `Disallow: ${api}`,
      "",
    ]),
    `Sitemap: ${new URL(sitePath("/sitemap.xml"), site).href}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
