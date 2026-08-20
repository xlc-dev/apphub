import { describe, expect, test } from "bun:test";
import { catalogSearchValue, matchesSearch } from "@/lib/search";

const app = {
  name: "Example Notes",
  summary: "Organize ideas locally",
  description: "An offline plain-text notebook",
  developer: { name: "Example Developers" },
  keywords: ["notes", "writing"],
  categories: ["Office", "Utility"],
  mimeTypes: ["text/plain"],
  source: "community" as const,
};
const value = catalogSearchValue(app);

describe("catalog search", () => {
  test("includes all searchable app metadata", () => {
    expect(value).toContain("example notes");
    expect(value).toContain("organize ideas locally");
    expect(value).toContain("offline plain-text notebook");
    expect(value).toContain("office utility");
    expect(value).toContain("example developers");
    expect(value).toContain("notes writing");
    expect(value).toContain("text/plain");
    expect(value).toContain("community");
  });

  test("matches case-insensitively", () => {
    expect(matchesSearch(value, "EXAMPLE")).toBe(true);
  });

  test("matches multiple terms in any order", () => {
    expect(matchesSearch(value, "utility offline")).toBe(true);
    expect(matchesSearch(value, "offline missing")).toBe(false);
  });

  test("matches an empty query", () => {
    expect(matchesSearch(value, "  ")).toBe(true);
  });
});
