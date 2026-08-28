import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  apiAppDetailSchema,
  apiAppSummarySchema,
  apiV1JsonSchema,
  apiMetadataV1Schema,
  apiPaginationSchema,
  apiSummaryPageSchema,
} from "#lib/api-v1-schema";

describe("API v1 contract", () => {
  test("publishes the resource union as JSON Schema", () => {
    assert.equal(apiV1JsonSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(apiV1JsonSchema.title, "AppHub API v1");
    assert.equal(apiV1JsonSchema.anyOf?.length, 8);
  });

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

  test("pins the application detail fields", () => {
    const app = apiAppDetailSchema.shape.app;
    const release = app.shape.latestRelease.unwrap();

    assert.deepEqual(app.keyof().options.sort(), [
      "addedAt",
      "categories",
      "contentRating",
      "description",
      "developer",
      "homepage",
      "icon",
      "id",
      "keywords",
      "latestRelease",
      "links",
      "mimeTypes",
      "name",
      "origin",
      "projectLicense",
      "provenance",
      "repository",
      "sandbox",
      "screenshots",
      "slug",
      "statistics",
      "status",
      "summary",
      "translations",
      "url",
      "webUrl",
    ]);
    assert.deepEqual(release.keyof().options.sort(), [
      "artifacts",
      "page",
      "publishedAt",
      "releaseId",
      "version",
    ]);
    assert.deepEqual(release.shape.artifacts.element.keyof().options.sort(), [
      "architecture",
      "assetId",
      "checksumEvidence",
      "name",
      "sha256",
      "signatures",
      "size",
      "url",
    ]);
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
