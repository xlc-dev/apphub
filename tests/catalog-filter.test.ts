import { describe, expect, test } from "bun:test";
import { catalogMatchState, matchesCategories } from "@/lib/catalog-filter";

describe("catalog filters", () => {
  test("shows every category when none are selected", () => {
    expect(matchesCategories(["Game"], new Set())).toBe(true);
  });

  test("matches any selected category", () => {
    const selected = new Set(["Graphics", "Game"]);

    expect(matchesCategories(["Game", "Emulator"], selected)).toBe(true);
    expect(matchesCategories(["Office"], selected)).toBe(false);
  });

  test("combines category and text filters", () => {
    const selected = new Set(["Graphics"]);

    expect(catalogMatchState("pinta paint graphics", "paint", ["Graphics"], selected).match).toBe(
      true
    );
    expect(catalogMatchState("pinta paint graphics", "notes", ["Graphics"], selected).match).toBe(
      false
    );
  });
});
