import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { readCatalogSnapshot } from "#catalog/snapshot";
import {
  apiMetadataV1Schema,
  apiSummaryPageSchema,
  apiV1JsonSchema,
  apiV1ResourceSchema,
} from "#lib/api-v1-schema";
import { localeDefinitions, locales } from "#lib/locales";

const limits = {
  collection: 128 * 1024,
  app: 128 * 1024,
  metadata: 16 * 1024,
  schema: 512 * 1024,
  searchIndex: 512 * 1024,
};

async function checkSize(path: string, limit: number) {
  const size = (await stat(path)).size;

  if (size > limit) {
    throw new Error(`${path}: ${size} bytes exceeds the ${limit}-byte limit`);
  }
}

const schemaPath = "dist/api/v1/schema.json";
const paths = (await readdir("dist/api/v1", { recursive: true }))
  .filter((path) => path.endsWith(".json"))
  .map((path) => `dist/api/v1/${path}`)
  .filter((path) => path !== schemaPath);
const snapshot = await readCatalogSnapshot();

await checkSize(schemaPath, limits.schema);
assert.deepEqual(JSON.parse(await readFile(schemaPath, "utf8")), apiV1JsonSchema);

for (const path of paths) {
  const isApp = /^dist\/api\/v1\/apps\/[^/]+\.json$/.test(path);
  const isMetadata = path.endsWith("/meta.json");

  await checkSize(path, isApp ? limits.app : isMetadata ? limits.metadata : limits.collection);
  const resource = apiV1ResourceSchema.parse(JSON.parse(await readFile(path, "utf8")));

  if (resource.revision !== snapshot.revision || resource.generatedAt !== snapshot.generatedAt) {
    throw new Error(`${path}: API resource does not match the generated catalog snapshot`);
  }
}

const metadata = apiMetadataV1Schema.parse(
  JSON.parse(await readFile("dist/api/v1/meta.json", "utf8"))
);
const appPage = apiSummaryPageSchema.parse(
  JSON.parse(await readFile("dist/api/v1/apps.json", "utf8"))
);
const statusCount = Object.values(metadata.freshness.statuses).reduce(
  (total, count) => total + count,
  0
);

if (
  metadata.counts.apps !== appPage.pagination.totalItems ||
  statusCount !== metadata.counts.apps
) {
  throw new Error("API app, pagination, and status counts do not match");
}

await Promise.all(
  locales
    .map((locale) => `dist${localeDefinitions[locale].path}/search-index.json`)
    .map((path) => checkSize(path, limits.searchIndex))
);

console.log(`Validated the API schema and ${paths.length} data resources.`);
