import assert from "node:assert/strict";
import { test } from "node:test";
import { parseThemeMode, resolveTheme } from "#lib/theme";

test("parses stored theme modes", () => {
  assert.equal(parseThemeMode("light"), "light");
  assert.equal(parseThemeMode("dark"), "dark");
  assert.equal(parseThemeMode("system"), "system");
  assert.equal(parseThemeMode("invalid"), "system");
  assert.equal(parseThemeMode(null), "system");
});

test("resolves system and explicit themes", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
