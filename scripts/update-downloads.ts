import { readFile } from "node:fs/promises";
import { downloadHistorySchema } from "#catalog/downloads";
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
import { forEachConcurrent } from "#scripts/concurrency";
import { writeJsonAtomic } from "#scripts/files";
import { fetchDownloadTotal } from "#scripts/releases/index";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const historyUrl = new URL("../.generated/downloads.json", import.meta.url);
const history = downloadHistorySchema.parse(JSON.parse(await readFile(historyUrl, "utf8")));

const previous = history.snapshots.at(-1)?.apps ?? {};
const apps: Record<string, number> = {};
const refresh: typeof history.refresh = {};
const refreshTime = new Date();
const forceRefresh =
  process.env.FORCE_REFRESH === "1" || process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

await forEachConcurrent(await readApps(), 4, async ({ app }) => {
  if (app.releaseSource.type !== "github" && app.releaseSource.type !== "codeberg") {
    return;
  }

  const attemptAt = new Date().toISOString();

  if (previous[app.id] !== undefined) {
    apps[app.id] = previous[app.id]!;
  }

  const previousState = history.refresh[app.id];

  if (!forceRefresh && !isRefreshDue(previousState, refreshEveryHours.statistics, refreshTime)) {
    refresh[app.id] = previousState!;

    return;
  }

  try {
    const total = await retryRefresh(() => fetchDownloadTotal(app));

    if (total !== undefined) {
      apps[app.id] = Math.max(previous[app.id] ?? 0, total);
    }

    refresh[app.id] = refreshSucceeded(new Date().toISOString());
  } catch (error) {
    refresh[app.id] = refreshFailed(previousState, attemptAt, classifyRefreshError(error));
    console.warn(`${app.id}: download refresh failed; using previous data: ${String(error)}`);
  }
});

const sortRecord = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));

history.refresh = sortRecord(refresh);

const date = new Date().toISOString().slice(0, 10);
const snapshot = { date, apps: sortRecord(apps) };
const latest = history.snapshots.at(-1);

if (latest?.date === date) {
  history.snapshots[history.snapshots.length - 1] = snapshot;
} else {
  history.snapshots.push(snapshot);
}

history.snapshots = history.snapshots.slice(-40);

await writeJsonAtomic(historyUrl, history);
console.log(`Recorded download totals for ${Object.keys(apps).length} applications.`);

if (import.meta.main) {
  await writeCatalogSnapshot();
  await printRefreshNetworkSummary();
}
