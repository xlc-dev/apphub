import { readFile } from "node:fs/promises";
import { readApps } from "#catalog/storage";
import {
  classifyRefreshError,
  isRefreshDue,
  refreshEveryHours,
  refreshFailed,
  refreshSucceeded,
  retryRefresh,
} from "#catalog/refresh";
import { printRefreshNetworkSummary } from "#catalog/network";
import {
  fetchRepositoryStars,
  repositoryStarEtagsSchema,
  repositoryStarsSchema,
  repositoryStarRequest,
} from "#lib/repository-stars";
import { writeJsonAtomic } from "#scripts/files";
import { forEachConcurrent } from "#scripts/concurrency";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const starsUrl = new URL("../.generated/stars.json", import.meta.url);
const etagsUrl = new URL("../.generated/star-etags.json", import.meta.url);
const previous = repositoryStarsSchema.parse(JSON.parse(await readFile(starsUrl, "utf8")));
const previousEtags = repositoryStarEtagsSchema.parse(JSON.parse(await readFile(etagsUrl, "utf8")));

const entries = await readApps();
const stars: Record<string, number> = {};
const refresh: typeof previous.refresh = {};
const etags: Record<string, string> = {};
const refreshTime = new Date();
const forceRefresh =
  process.env.FORCE_REFRESH === "1" || process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

await forEachConcurrent(entries, 4, async ({ slug, app }) => {
  if (!app.repository) {
    return;
  }

  const repository = app.repository;

  if (!repositoryStarRequest(repository)) {
    return;
  }

  if (previous.values[slug] !== undefined) {
    stars[slug] = previous.values[slug];
  }

  const previousState = previous.refresh[slug];

  if (!forceRefresh && !isRefreshDue(previousState, refreshEveryHours.statistics, refreshTime)) {
    refresh[slug] = previousState!;

    if (previousEtags[slug]) etags[slug] = previousEtags[slug];

    return;
  }

  try {
    const result = await retryRefresh(() =>
      fetchRepositoryStars(repository, process.env.GITHUB_TOKEN, previousEtags[slug])
    );

    if (!result) {
      return;
    }

    const count = result.count ?? previous.values[slug];

    if (count !== undefined) {
      stars[slug] = count;
    }

    if (result.etag) {
      etags[slug] = result.etag;
    }

    refresh[slug] = refreshSucceeded(new Date().toISOString());
  } catch (error) {
    console.warn(`${slug}: could not fetch repository stars: ${String(error)}`);
    const category = classifyRefreshError(error);

    refresh[slug] = refreshFailed(previousState, new Date().toISOString(), category);

    if (previousEtags[slug]) {
      etags[slug] = previousEtags[slug];
    }
  }
});

const sortRecord = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));

await writeJsonAtomic(starsUrl, {
  values: sortRecord(stars),
  refresh: sortRecord(refresh),
});
await writeJsonAtomic(etagsUrl, sortRecord(etags));
console.log(`Wrote ${Object.keys(stars).length} repository star counts`);

if (import.meta.main) {
  await writeCatalogSnapshot();
  await printRefreshNetworkSummary();
}
