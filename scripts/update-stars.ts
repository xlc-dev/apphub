import { mkdir, writeFile } from "node:fs/promises";
import { readApps } from "@catalog/core";
import { fetchRepositoryStars, repositoryStarRequest } from "@/lib/repository-stars";

const outputDirectory = `${process.cwd()}/.cache`;
const outputFile = `${outputDirectory}/repository-stars.json`;
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
    }
  })
);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(stars, null, 2)}\n`);
console.log(`Wrote ${Object.keys(stars).length} repository star counts`);
