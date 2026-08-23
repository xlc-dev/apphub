import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { catalogSearchValue, matchesSearch } from "#lib/search";

const app = {
  name: "Example Notes",
  summary: "Organize ideas locally",
  description: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, value: "An offline plain-text notebook" }],
    },
  ],
  developer: { name: "Example Developers" },
  keywords: ["notes", "writing"],
  categories: ["Office", "Utility"],
  mimeTypes: ["text/plain"],
  source: "community" as const,
};

const value = catalogSearchValue(app);

describe("catalog search", () => {
  test("includes all searchable app metadata", () => {
    assert.match(value, /example notes/);
    assert.match(value, /organize ideas locally/);
    assert.match(value, /offline plain-text notebook/);
    assert.match(value, /office utility/);
    assert.match(value, /example developers/);
    assert.match(value, /notes writing/);
    assert.match(value, /text\/plain/);
    assert.match(value, /community/);
  });

  test("matches case-insensitively", () => {
    assert.equal(matchesSearch(value, "EXAMPLE"), true);
  });

  test("matches substrings from the first character", () => {
    assert.equal(matchesSearch("silvermarsh credential vault", "s"), true);
    assert.equal(matchesSearch("silvermarsh credential vault", "marsh"), true);
  });

  test("does not fuzzily match ordered characters", () => {
    assert.equal(matchesSearch("silvermarsh credential vault", "slvrmrsh"), false);
    assert.equal(matchesSearch("alternatives", "lev"), false);
  });

  test("matches multiple terms in any order", () => {
    assert.equal(matchesSearch(value, "utility offline"), true);
    assert.equal(matchesSearch(value, "offline missing"), false);
  });

  test("matches an empty query", () => {
    assert.equal(matchesSearch(value, "  "), true);
  });
});
