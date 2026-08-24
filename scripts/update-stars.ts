import { readFile, writeFile } from "node:fs/promises";
import { readApps, root } from "#catalog/core";
import { repositoryStarEtagsSchema, repositoryStarsSchema } from "#catalog/stars";
import { fetchRepositoryStars, RepositoryRateLimitError } from "#lib/repository-stars";

const starsUrl = new URL(".generated/stars.json", root);
const etagsUrl = new URL(".generated/star-etags.json", root);
const previous = repositoryStarsSchema.parse(JSON.parse(await readFile(starsUrl, "utf8")));
const previousEtags = repositoryStarEtagsSchema.parse(JSON.parse(await readFile(etagsUrl, "utf8")));

const entries = await readApps();
const stars: Record<string, number> = {};
const etags: Record<string, string> = {};

for (const { slug, app } of entries) {
  if (!app.repository) {
    continue;
  }

  try {
    const result = await fetchRepositoryStars(
      app.repository,
      process.env.GITHUB_TOKEN,
      previousEtags[slug]
    );

    if (!result) {
      continue;
    }

    const count = result.count ?? previous[slug];

    if (count !== undefined) {
      stars[slug] = count;
    }

    if (result.etag) {
      etags[slug] = result.etag;
    }
  } catch (error) {
    if (error instanceof RepositoryRateLimitError) {
      throw error;
    }

    console.warn(`${slug}: could not fetch repository stars: ${String(error)}`);

    if (previous[slug] !== undefined) {
      stars[slug] = previous[slug];
    }

    if (previousEtags[slug]) {
      etags[slug] = previousEtags[slug];
    }
  }
}

const sortRecord = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));

await writeFile(starsUrl, `${JSON.stringify(sortRecord(stars), null, 2)}\n`);
await writeFile(etagsUrl, `${JSON.stringify(sortRecord(etags), null, 2)}\n`);
console.log(`Wrote ${Object.keys(stars).length} repository star counts`);
