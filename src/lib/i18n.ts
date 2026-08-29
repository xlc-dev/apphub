import { defaultLocale, isLocale, localeDefinitions, locales, type Locale } from "#lib/locales";
import type { MessageKey } from "#lib/translations/en";
import { localizedValues, messages } from "#lib/translations/index";

const technicalAcronyms = new Set(["fuse", "gpu", "kvm", "usb"]);

export function getLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function localePath(path: string, locale: Locale) {
  if (!path.startsWith("/")) return path;

  return `${localeDefinitions[locale].path}${path}`;
}

export function stripLocale(path: string) {
  const definition = locales
    .map((locale) => localeDefinitions[locale])
    .find(({ path: prefix }) => prefix && (path === prefix || path.startsWith(`${prefix}/`)));

  return definition ? path.slice(definition.path.length) || "/" : path;
}

export function translate(locale: Locale, key: MessageKey, values: Record<string, unknown> = {}) {
  const message = messages[locale][key];

  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message
  );
}

export function translateValue(locale: Locale, value: string) {
  return localizedValues[locale]?.[value] ?? value.replaceAll("-", " ");
}

export function translatedLabel(locale: Locale, value: string) {
  if (technicalAcronyms.has(value)) return value.toLocaleUpperCase(locale);

  const translated = translateValue(locale, value);

  return translated.charAt(0).toLocaleUpperCase(locale) + translated.slice(1);
}
