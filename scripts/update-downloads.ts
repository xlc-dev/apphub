import { readFile, writeFile } from "node:fs/promises";
import { z } from "astro/zod";
import { downloadHistorySchema, sumGitHubDownloads } from "@catalog/downloads";
import { readApps, root } from "@catalog/core";

const githubReleaseSchema = z.object({
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(
    z.object({
      name: z.string(),
      download_count: z.number().int().nonnegative(),
    })
  ),
});

const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "AppHub download updater",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function githubDownloads(repository: string) {
  let total = 0;

  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(30_000) }
    );

    if (!response.ok) throw new Error(`${repository}: GitHub returned ${response.status}`);

    const releases = z.array(githubReleaseSchema).parse(await response.json());

    total += sumGitHubDownloads(releases);

    if (releases.length < 100) return total;
  }
}

const historyUrl = new URL("catalog/downloads.json", root);
const history = downloadHistorySchema.parse(JSON.parse(await readFile(historyUrl, "utf8")));
const previous = history.snapshots.at(-1)?.apps ?? {};
const apps: Record<string, number> = {};

for (const { app } of await readApps()) {
  if (app.releaseSource.type !== "github") continue;

  const total = await githubDownloads(app.releaseSource.repository);

  apps[app.id] = Math.max(previous[app.id] ?? 0, total);
}

const date = new Date().toISOString().slice(0, 10);
const snapshot = { date, apps };

if (history.snapshots.at(-1)?.date === date)
  history.snapshots[history.snapshots.length - 1] = snapshot;
else history.snapshots.push(snapshot);

history.snapshots = history.snapshots.slice(-40);

await writeFile(historyUrl, `${JSON.stringify(history, null, 2)}\n`);
console.log(`Recorded download totals for ${Object.keys(apps).length} applications.`);
