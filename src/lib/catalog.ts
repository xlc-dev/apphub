import { readApps } from "@catalog/core";

const icons = import.meta.glob("/apps/*/icon.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export async function getCatalog() {
  const entries = await readApps();

  return entries
    .map(({ slug, app: manifest, lock }) => {
      const { assets: _assets, icon: _icon, releaseSource, ...app } = manifest;
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
        icon: icons[`/apps/${slug}/icon.png`] ?? "/favicon.svg",
        source: releaseSource,
        releases: lock.releases,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
