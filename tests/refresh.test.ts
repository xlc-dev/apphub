import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  catalogStatus,
  classifyRefreshError,
  isRefreshDue,
  isStale,
  refreshFailed,
  RefreshError,
  refreshSucceeded,
} from "#catalog/refresh";

const successAt = "2026-08-01T00:00:00Z";

describe("refresh state", () => {
  test("keeps the last success when a refresh fails", () => {
    const failed = refreshFailed(refreshSucceeded(successAt), "2026-08-02T00:00:00Z", "network");

    assert.equal(failed.lastSuccessAt, successAt);
    assert.equal(failed.incident?.consecutiveFailures, 1);
    assert.equal(
      refreshFailed(failed, "2026-08-03T00:00:00Z", "network").incident?.consecutiveFailures,
      2
    );
  });

  test("records an initial failure without inventing a success", () => {
    const failed = refreshFailed(undefined, "2026-08-02T00:00:00Z", "network");

    assert.equal(failed.lastSuccessAt, undefined);
    assert.equal(failed.incident?.consecutiveFailures, 1);
    assert.equal(isStale(failed, 7), true);
  });

  test("derives staleness from the last success", () => {
    const state = refreshSucceeded(successAt);

    assert.equal(isStale(state, 3, new Date("2026-08-04T00:00:00Z")), false);
    assert.equal(isStale(state, 3, new Date("2026-08-04T00:00:00.001Z")), true);
  });

  test("derives refresh due times without storing schedules", () => {
    const success = refreshSucceeded(successAt);
    const failed = refreshFailed(success, "2026-08-02T00:00:00Z", "network");

    assert.equal(isRefreshDue(undefined, 24, new Date("2026-08-02T00:00:00Z")), true);
    assert.equal(isRefreshDue(success, 24, new Date("2026-08-01T23:59:59Z")), false);
    assert.equal(isRefreshDue(success, 24, new Date("2026-08-02T00:00:00Z")), true);
    assert.equal(isRefreshDue(failed, 24, new Date("2026-08-02T05:59:59Z")), false);
    assert.equal(isRefreshDue(failed, 24, new Date("2026-08-02T06:00:00Z")), true);
  });

  test("quarantines integrity failures and disables repeatedly missing releases", () => {
    const current = refreshSucceeded("2026-08-26T00:00:00Z");
    const integrity = refreshFailed(current, "2026-08-26T01:00:00Z", "integrity");
    let missing = refreshFailed(current, "2026-08-26T01:00:00Z", "not-found");

    missing = refreshFailed(missing, "2026-08-26T02:00:00Z", "not-found");
    missing = refreshFailed(missing, "2026-08-26T03:00:00Z", "not-found");

    assert.equal(catalogStatus(current, integrity), "quarantined");
    assert.equal(catalogStatus(current, missing), "unavailable");
  });

  test("uses stable machine-readable failure categories", () => {
    assert.equal(classifyRefreshError(new Error("HTTP 429")), "rate-limit");
    assert.equal(classifyRefreshError(new Error("HTTP 503")), "network");
    assert.equal(classifyRefreshError(new Error("HTTP 404")), "not-found");
    assert.equal(classifyRefreshError(new RefreshError("integrity", "Changed")), "integrity");
    assert.equal(classifyRefreshError(new RefreshError("not-found", "Missing")), "not-found");
    assert.equal(classifyRefreshError(new Error("No current release")), "not-found");
    assert.equal(classifyRefreshError(new Error("Malformed JSON")), "invalid-data");
  });
});
