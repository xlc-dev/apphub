export type ThemeMode = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export function parseThemeMode(value: string | null): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): Theme {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
