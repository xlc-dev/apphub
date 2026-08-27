import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  apiAppDetailSchema,
  apiAppSummarySchema,
  apiMetadataV1Schema,
  apiPaginationSchema,
  apiSummaryPageSchema,
} from "#lib/api-v1-schema";

describe("API v1 contract", () => {
  test("defines collection and pagination envelopes", () => {
    assert.deepEqual(apiSummaryPageSchema.keyof().options.sort(), [
      "generatedAt",
      "items",
      "pagination",
      "revision",
    ]);
    assert.deepEqual(apiPaginationSchema.keyof().options.sort(), [
      "next",
      "page",
      "pageSize",
      "previous",
      "totalItems",
      "totalPages",
    ]);
  });

  test("defines compact filterable summaries", () => {
    assert.deepEqual(apiAppSummarySchema.keyof().options.sort(), [
      "addedAt",
      "categories",
      "icon",
      "id",
      "latestRelease",
      "name",
      "origin",
      "projectLicense",
      "slug",
      "statistics",
      "status",
      "summary",
      "url",
      "webUrl",
    ]);
    assert.deepEqual(apiAppSummarySchema.shape.statistics.keyof().options.sort(), [
      "downloads",
      "stars",
    ]);
  });

  test("publishes only the latest release in app details", () => {
    const keys: readonly string[] = apiAppDetailSchema.shape.app.keyof().options;

    assert.equal(keys.includes("latestRelease"), true);
    assert.equal(keys.includes("releases"), false);
  });

  test("keeps HTTP cache validators internal", () => {
    const provenance = apiAppDetailSchema.shape.app.shape.provenance;
    const metadataKeys: readonly string[] = provenance.shape.metadata.keyof().options;
    const releaseSourceKeys: readonly string[] = provenance.shape.releaseSource.keyof().options;

    assert.equal(metadataKeys.includes("validator"), false);
    assert.equal(releaseSourceKeys.includes("validator"), false);
  });

  test("separates generation and upstream freshness", () => {
    assert.deepEqual(apiMetadataV1Schema.keyof().options.sort(), [
      "counts",
      "freshness",
      "generatedAt",
      "revision",
      "version",
    ]);
    assert.deepEqual(apiMetadataV1Schema.shape.freshness.keyof().options.sort(), [
      "downloadsUpdatedAt",
      "incidents",
      "staleResources",
      "statuses",
    ]);
  });
});
