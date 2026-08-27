export const localeDefinitions = {
  en: { name: "English", path: "/en", openGraph: "en_US" },
  nl: { name: "Nederlands", path: "/nl", openGraph: "nl_NL" },
} as const;

export type Locale = keyof typeof localeDefinitions;
export const locales = Object.keys(localeDefinitions) as Locale[];
export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && Object.hasOwn(localeDefinitions, value);
}
