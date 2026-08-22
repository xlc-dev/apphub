import { expect, test } from "bun:test";
import { parseThemeMode, resolveTheme } from "@/lib/theme";

test("parses stored theme modes", () => {
  expect(parseThemeMode("light")).toBe("light");
  expect(parseThemeMode("dark")).toBe("dark");
  expect(parseThemeMode("system")).toBe("system");
  expect(parseThemeMode("invalid")).toBe("system");
  expect(parseThemeMode(null)).toBe("system");
});

test("resolves system and explicit themes", () => {
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});
