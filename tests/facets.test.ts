import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { facetCounts, facetItems, facetResourcePath, matchesFacet } from "#lib/facets";

const apps = [
  {
    categories: ["Utility", "System"],
    releases: [{ artifacts: [{ architecture: "x86_64" }, { architecture: "aarch64" }] }],
  },
  {
    categories: ["Utility"],
    releases: [{ artifacts: [{ architecture: "x86_64" }] }],
  },
];

describe("catalog facets", () => {
  test("counts and matches fields through shared definitions", () => {
    assert.deepEqual(
      [...facetCounts(apps, "category")],
      [
        ["Utility", 2],
        ["System", 1],
      ]
    );
    assert.deepEqual(
      [...facetCounts(apps, "architecture")],
      [
        ["x86_64", 2],
        ["aarch64", 1],
      ]
    );
    assert.equal(matchesFacet(apps[0]!, "architecture", "aarch64"), true);
    assert.equal(matchesFacet(apps[1]!, "category", "System"), false);
  });

  test("provides stable API resource paths", () => {
    assert.equal(facetResourcePath("category", "Utility"), "/api/v1/categories/Utility.json");
    assert.equal(facetResourcePath("architecture", "x86_64"), "/api/v1/architectures/x86_64.json");
  });

  test("builds sorted collection metadata from facet configuration", () => {
    assert.deepEqual(facetItems(apps, "category"), [
      { id: "System", name: "System", slug: "system", count: 1 },
      { id: "Utility", name: "Utility", slug: "utility", count: 2 },
    ]);
    assert.deepEqual(facetItems(apps, "architecture"), [
      { id: "aarch64", count: 1 },
      { id: "x86_64", count: 2 },
    ]);
  });
});
