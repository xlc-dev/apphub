import { readFile, writeFile } from "node:fs/promises";
import { readApps, root } from "#catalog/core";
import { repositoryStarsSchema } from "#catalog/stars";
import { fetchRepositoryStars, repositoryStarRequest } from "#lib/repository-stars";

const starsUrl = new URL(".generated/stars.json", root);
const previous = repositoryStarsSchema.parse(JSON.parse(await readFile(starsUrl, "utf8")));

const entries = await readApps();
const stars: Record<string, number> = {};

await Promise.all(
  entries.map(async ({ slug, app }) => {
    if (!app.repository || !repositoryStarRequest(app.repository)) {
      return;
    }

    try {
      const count = await fetchRepositoryStars(app.repository, process.env.GITHUB_TOKEN);
      if (count !== undefined) {
        stars[slug] = count;
      }
    } catch (error) {
      console.warn(`${slug}: could not fetch repository stars: ${String(error)}`);

      if (previous[slug] !== undefined) {
        stars[slug] = previous[slug];
      }
    }
  })
);

const sortedStars = Object.fromEntries(
  Object.entries(stars).sort(([left], [right]) => left.localeCompare(right))
);

await writeFile(starsUrl, `${JSON.stringify(sortedStars, null, 2)}\n`);
console.log(`Wrote ${Object.keys(stars).length} repository star counts`);
