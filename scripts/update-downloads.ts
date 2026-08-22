import { readFile, writeFile } from "node:fs/promises";
import { downloadHistorySchema } from "@catalog/downloads";
import { readApps, root } from "@catalog/core";
import { fetchDownloadTotal } from "./releases";

const historyUrl = new URL("catalog/downloads.json", root);
const history = downloadHistorySchema.parse(JSON.parse(await readFile(historyUrl, "utf8")));
const previous = history.snapshots.at(-1)?.apps ?? {};
const apps: Record<string, number> = {};

for (const { app } of await readApps()) {
  const total = await fetchDownloadTotal(app);

  if (total !== undefined) {
    apps[app.id] = Math.max(previous[app.id] ?? 0, total);
  }
}

const date = new Date().toISOString().slice(0, 10);
const snapshot = { date, apps };
const latest = history.snapshots.at(-1);

if (latest?.date === date) {
  history.snapshots[history.snapshots.length - 1] = snapshot;
} else {
  history.snapshots.push(snapshot);
}

history.snapshots = history.snapshots.slice(-40);

await writeFile(historyUrl, `${JSON.stringify(history, null, 2)}\n`);
console.log(`Recorded download totals for ${Object.keys(apps).length} applications.`);
