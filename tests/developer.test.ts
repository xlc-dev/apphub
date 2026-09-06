import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { developerUrl } from "#catalog/developer";

describe("developer URLs", () => {
  test("links to the repository namespace on supported forges", () => {
    assert.equal(
      developerUrl("https://github.com/example/example-app", "https://example.com/"),
      "https://github.com/example"
    );
    assert.equal(
      developerUrl("https://gitlab.gnome.org/example/example-app", "https://example.com/"),
      "https://gitlab.gnome.org/example"
    );
  });

  test("uses the homepage when a developer page cannot be derived safely", () => {
    assert.equal(
      developerUrl("https://example.org/source/app", "https://example.org/app"),
      "https://example.org/app"
    );
    assert.equal(developerUrl(undefined, "https://example.org/app"), "https://example.org/app");
  });
});
