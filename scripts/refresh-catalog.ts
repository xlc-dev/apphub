import { generateCatalog } from "#scripts/generate-catalog";
import { printRefreshNetworkSummary } from "#catalog/network";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const forceRefresh =
  process.env.FORCE_REFRESH === "1" || process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

try {
  await generateCatalog({ failSoft: true, forceRefresh });
  await import("#scripts/update-downloads");
  await import("#scripts/update-stars");
  await writeCatalogSnapshot();
} finally {
  await printRefreshNetworkSummary();
}
