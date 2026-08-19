import { readApps } from "@catalog/core";

const icons = import.meta.glob("/apps/*/icon.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const screenshots = import.meta.glob("/apps/*/screenshot-*.*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

function imageType(file: string): "image/jpeg" | "image/png" | "image/webp" {
  if (file.toLowerCase().endsWith(".png")) return "image/png";
  if (file.toLowerCase().endsWith(".webp")) return "image/webp";

  return "image/jpeg";
}

export async function getCatalog() {
  const entries = await readApps();

  return entries
    .map(({ slug, app: manifest, lock }) => {
      const { assets: _assets, releaseSource, ...app } = manifest;
      const sourceHomepage =
        releaseSource.type === "github"
          ? `https://github.com/${releaseSource.repository}`
          : lock.releases[0]?.page;

      return {
        ...app,
        description: app.description ?? app.summary,
        homepage: app.homepage ?? sourceHomepage,
        categories: app.categories ?? [],
        slug,
        icon: icons[`/apps/${slug}/icon.png`]!,
        screenshots: app.screenshots.map(({ file, ...screenshot }) => ({
          ...screenshot,
          url: screenshots[`/apps/${slug}/${file}`]!,
          type: imageType(file),
        })),
        source: releaseSource,
        releases: lock.releases,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type CatalogApp = Awaited<ReturnType<typeof getCatalog>>[number];
