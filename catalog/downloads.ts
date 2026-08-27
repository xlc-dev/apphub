import { z } from "zod";
import { refreshStateSchema } from "#catalog/refresh";

const downloadSnapshotSchema = z
  .object({
    date: z.iso.date(),
    apps: z.record(z.string().min(1), z.number().int().nonnegative()),
  })
  .strict();

export const downloadHistorySchema = z
  .object({
    snapshots: z.array(downloadSnapshotSchema),
    refresh: z.record(z.string().min(1), refreshStateSchema),
  })
  .strict()
  .refine(
    ({ snapshots }) =>
      snapshots.every(
        (snapshot, index) => index === 0 || snapshot.date > snapshots[index - 1]!.date
      ),
    "Download snapshots must be unique and ordered oldest first"
  );

type DownloadHistory = z.infer<typeof downloadHistorySchema>;

export function latestDownloadDate(history: DownloadHistory) {
  return history.snapshots.at(-1)?.date ?? null;
}

interface ForgeReleaseDownloads {
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ name: string; download_count: number }>;
}

export function sumReleaseDownloads(releases: ForgeReleaseDownloads[]) {
  let total = 0;

  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }

    for (const asset of release.assets) {
      if (asset.name.toLowerCase().endsWith(".appimage")) {
        total += asset.download_count;
      }
    }
  }

  return total;
}

export function downloadCounts(history: DownloadHistory, days?: number) {
  const latest = history.snapshots.at(-1);

  if (!latest) {
    return null;
  }

  if (days === undefined) {
    return latest.apps;
  }

  const cutoff = new Date(`${latest.date}T00:00:00Z`);

  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const baseline = history.snapshots.findLast((snapshot) => snapshot.date <= cutoffDate);

  if (!baseline) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(latest.apps).flatMap(([id, count]) =>
      baseline.apps[id] === undefined ? [] : [[id, Math.max(0, count - baseline.apps[id])]]
    )
  );
}
