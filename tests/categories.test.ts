import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { categoryName, categoryPath, categorySlug } from "#lib/categories";

describe("category URLs", () => {
  test("creates labels and stable paths from category identifiers", () => {
    assert.equal(categoryName("AudioVideo"), "Audio & Video");
    assert.equal(categorySlug("AudioVideo"), "audio-video");
    assert.equal(categoryPath("AudioVideo"), "/categories/audio-video/");
  });

  test("separates words in category identifiers", () => {
    assert.equal(categorySlug("AudioVideoEditing"), "audio-video-editing");
    assert.equal(categoryName("2DGraphics"), "2D Graphics");
    assert.equal(categorySlug("2DGraphics"), "2d-graphics");
  });

  test("rejects categories without a usable slug", () => {
    assert.throws(() => categorySlug("---"), /no usable URL slug/);
  });
});
