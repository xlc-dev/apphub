import type { App } from "#catalog/schema";

interface LocalizableApp {
  name: string;
  summary: string;
  description: App["description"];
  developer: App["developer"];
  keywords?: App["keywords"] | undefined;
  screenshots: Array<{
    caption: string;
    captionTranslations?: Record<string, string> | undefined;
  }>;
  contentRating?: App["contentRating"] | undefined;
  translations?: App["translations"] | undefined;
}

export function normalizeLocale(value: string) {
  const tag = value.trim().replaceAll("_", "-");

  try {
    const [locale] = Intl.getCanonicalLocales(tag);

    if (!locale || !/^[a-z]{2,3}(?:-|$)/i.test(locale)) {
      throw new Error();
    }

    return locale;
  } catch {
    throw new Error(`Invalid locale tag: ${value}`);
  }
}

function candidates(locale: string) {
  const normalized = normalizeLocale(locale);
  const language = new Intl.Locale(normalized).language;

  return normalized === language ? [normalized] : [normalized, language];
}

function translated<T>(
  app: LocalizableApp,
  locale: string,
  value: (translation: NonNullable<LocalizableApp["translations"]>[string]) => T | undefined
) {
  for (const candidate of candidates(locale)) {
    const translation = app.translations?.[candidate];
    const result = translation && value(translation);

    if (result !== undefined) return result;
  }

  return undefined;
}

export function localizeApp<T extends LocalizableApp>(app: T, locale: string): T {
  const contentRating = app.contentRating;
  const translatedRating = translated(app, locale, (translation) => translation.contentRating);

  return {
    ...app,
    name: translated(app, locale, (translation) => translation.name) ?? app.name,
    summary: translated(app, locale, (translation) => translation.summary) ?? app.summary,
    description:
      translated(app, locale, (translation) => translation.description) ?? app.description,
    developer: {
      ...app.developer,
      name:
        translated(app, locale, (translation) => translation.developerName) ?? app.developer.name,
    },
    keywords: translated(app, locale, (translation) => translation.keywords) ?? app.keywords,
    screenshots: app.screenshots.map((screenshot) => ({
      ...screenshot,
      caption:
        candidates(locale)
          .map((candidate) => screenshot.captionTranslations?.[candidate])
          .find((caption) => caption !== undefined) ?? screenshot.caption,
    })),
    ...(contentRating
      ? {
          contentRating: {
            ...contentRating,
            label: translatedRating?.label ?? contentRating.label,
            warnings: translatedRating?.warnings ?? contentRating.warnings,
          },
        }
      : {}),
  };
}
