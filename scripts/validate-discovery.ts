import { access, readFile, readdir, stat } from "node:fs/promises";

const site = "https://xlc-dev.github.io";
const base = "/apphub";
const maximumSitemapBytes = 5 * 1024 * 1024;
const maximumSitemapUrls = 40_000;
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const sitemapSize = (await stat("dist/sitemap.xml")).size;

if (sitemapSize > maximumSitemapBytes) {
  throw new Error(`Sitemap is ${sitemapSize} bytes; limit is ${maximumSitemapBytes}`);
}

const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
const locationSet = new Set(locations);
const sitemapShell = sitemap.replaceAll(/ {2}<url><loc>[^<]+<\/loc><\/url>\n/g, "");
const expectedShell = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  "</urlset>",
  "",
].join("\n");

if (!locations.length) throw new Error("Sitemap contains no URLs");
if (sitemapShell !== expectedShell) throw new Error("Sitemap XML has an invalid structure");
if (locationSet.size !== locations.length) throw new Error("Sitemap contains duplicate URLs");
if (locations.length > maximumSitemapUrls) {
  throw new Error(`Sitemap contains ${locations.length} URLs; limit is ${maximumSitemapUrls}`);
}

for (const location of locations) {
  const url = new URL(location);

  if (url.origin !== site || !url.pathname.startsWith(`${base}/`)) {
    throw new Error(`Sitemap URL does not use the production site and base path: ${location}`);
  }

  const route = url.pathname.slice(`${base}/`.length);

  await access(route ? `dist/${route}index.html` : "dist/index.html");
}

for (const path of (await readdir("dist", { recursive: true })).filter((path) =>
  path.endsWith(".html")
)) {
  const page = await readFile(`dist/${path}`, "utf8");

  if (
    path === "404.html" ||
    page.includes('<meta http-equiv="refresh"') ||
    page.includes('<meta name="robots" content="noindex,follow"')
  ) {
    continue;
  }

  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(page)?.[1];

  if (!canonical) throw new Error(`dist/${path}: indexable page has no canonical URL`);
  if (!locationSet.has(canonical)) {
    throw new Error(`dist/${path}: indexable canonical is missing from sitemap: ${canonical}`);
  }
}

const robots = await readFile("dist/robots.txt", "utf8");
const searchCrawlers = [
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "YandexBot",
  "Baiduspider",
  "MojeekBot",
];
const expectedRobots = [
  "User-agent: *",
  `Disallow: ${base}/`,
  "",
  ...searchCrawlers.flatMap((crawler) => [
    `User-agent: ${crawler}`,
    `Allow: ${base}/`,
    `Disallow: ${base}/api/`,
    "",
  ]),
  `Sitemap: ${site}${base}/sitemap.xml`,
  "",
].join("\n");

if (robots !== expectedRobots) {
  throw new Error("robots.txt does not allow only approved search crawlers");
}

console.log(`Validated ${locations.length} sitemap URLs and robots.txt.`);
