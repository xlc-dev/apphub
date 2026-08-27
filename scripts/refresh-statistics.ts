import { cp, rename, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { printRefreshNetworkSummary } from "#catalog/network";
import { generateReleases } from "#scripts/update-releases";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const generatedPath = `.generated/apps.tmp-${process.pid}`;
const forceRefresh =
  process.env.FORCE_REFRESH === "1" || process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

try {
  await rm(generatedPath, { recursive: true, force: true });
  await cp(".generated/apps", generatedPath, { recursive: true });

  try {
    await generateReleases(pathToFileURL(`${process.cwd()}/${generatedPath}/`), [], {
      failSoft: true,
      forceRefresh,
    });
    await rm(".generated/apps", { recursive: true, force: true });
    await rename(generatedPath, ".generated/apps");
  } catch (error) {
    await rm(generatedPath, { recursive: true, force: true });
    throw error;
  }

  await import("#scripts/update-downloads");
  await import("#scripts/update-stars");
  await writeCatalogSnapshot();
} finally {
  await printRefreshNetworkSummary();
}
