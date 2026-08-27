import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  catalogSearchValue,
  matchesSearch,
  searchCardSelectors,
  searchPage,
  type SearchIndexEntry,
} from "#lib/search";

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
  origin: { type: "third-party" as const },
};

const value = catalogSearchValue(app);

function entry(name: string, value: string): SearchIndexEntry {
  return {
    slug: name.toLowerCase(),
    name,
    summary: `${name} summary`,
    origin: "third-party",
    categories: ["Utility"],
    icon: { url: `${name}.webp` },
    value,
  };
}

describe("catalog search", () => {
  test("includes all searchable app metadata", () => {
    assert.match(value, /example notes/);
    assert.match(value, /organize ideas locally/);
    assert.match(value, /offline plain-text notebook/);
    assert.match(value, /office utility/);
    assert.match(value, /example developers/);
    assert.match(value, /notes writing/);
    assert.match(value, /text\/plain/);
    assert.match(value, /third-party/);
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

  test("paginates filtered results", () => {
    const index = [
      entry("One", "editor text"),
      entry("Two", "editor image"),
      entry("Three", "editor audio"),
      entry("Four", "game"),
    ];

    assert.deepEqual(searchPage(index, "editor", 2, 2), {
      apps: [index[2]],
      page: 2,
      pages: 2,
      total: 3,
    });
  });

  test("bounds search result pages", () => {
    const index = [entry("One", "editor")];

    assert.equal(searchPage(index, "editor", 20).page, 1);
    assert.deepEqual(searchPage(index, "missing", 1), {
      apps: [],
      page: 1,
      pages: 1,
      total: 0,
    });
  });

  test("keeps dynamic search bindings on the shared card components", async () => {
    const sources = await Promise.all([
      readFile(new URL("../src/components/AppCard.astro", import.meta.url), "utf8"),
      readFile(new URL("../src/components/SourceBadge.astro", import.meta.url), "utf8"),
    ]);
    const source = sources.join("\n");

    for (const selector of Object.values(searchCardSelectors)) {
      assert.match(source, new RegExp(selector.slice(1, -1)));
    }
  });
});
