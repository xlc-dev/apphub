import { readFile } from "node:fs/promises";
import { downloadCounts, downloadHistorySchema } from "@catalog/downloads";
import { root } from "@catalog/core";
import { getCatalog } from "@/lib/catalog";

export async function getDownloadRanking(days?: number) {
  const data = JSON.parse(await readFile(new URL("catalog/downloads.json", root), "utf8"));
  const counts = downloadCounts(downloadHistorySchema.parse(data), days);

  if (!counts) return null;

  return (await getCatalog())
    .flatMap((app) => {
      const downloads = counts[app.id];

      return downloads === undefined ? [] : [{ app, downloads }];
    })
    .sort(
      (left, right) =>
        right.downloads - left.downloads || left.app.name.localeCompare(right.app.name)
    );
}
