import { describe, expect, test } from "bun:test";
import { categoryPath, categorySlug } from "@/lib/categories";

describe("category URLs", () => {
  test("creates stable paths from display names", () => {
    expect(categorySlug("Audio & Video")).toBe("audio-video");
    expect(categoryPath("Audio & Video")).toBe("/categories/audio-video");
  });

  test("normalizes case and surrounding separators", () => {
    expect(categorySlug("  Audio Video  ")).toBe("audio-video");
  });

  test("rejects categories without a usable slug", () => {
    expect(() => categorySlug("---")).toThrow("no usable URL slug");
  });
});
