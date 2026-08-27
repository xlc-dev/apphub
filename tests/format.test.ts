import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatBytes, formatVersion } from "#lib/format";

describe("byte formatting", () => {
  test("uses binary units", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1536), "1.5 KiB");
    assert.equal(formatBytes(10 * 1024 * 1024), "10 MiB");
  });
});

describe("version formatting", () => {
  test("removes packaging details", () => {
    assert.equal(formatVersion("1.2.3-4@2099-01-02_1234567890"), "1.2.3-4");
    assert.equal(formatVersion("v5.6.7@2099-01-02_1234567890"), "5.6.7");
  });
});
