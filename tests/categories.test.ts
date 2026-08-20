import { describe, expect, test } from "bun:test";
import { categoryName, categoryPath, categorySlug } from "@/lib/categories";

describe("category URLs", () => {
  test("creates labels and stable paths from category identifiers", () => {
    expect(categoryName("AudioVideo")).toBe("Audio & Video");
    expect(categorySlug("AudioVideo")).toBe("audio-video");
    expect(categoryPath("AudioVideo")).toBe("/categories/audio-video");
  });

  test("separates words in category identifiers", () => {
    expect(categorySlug("AudioVideoEditing")).toBe("audio-video-editing");
  });

  test("rejects categories without a usable slug", () => {
    expect(() => categorySlug("---")).toThrow("no usable URL slug");
  });
});
