import { z } from "zod";
import { parseDescription, projectLinks } from "#catalog/appstream";
import { readResponse, safeFetch } from "#catalog/http";
import { normalizeLocale } from "#catalog/localization";
import { appstreamMetadataSchema } from "#catalog/schema";

const flathubSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  developer_name: z.string(),
  project_license: z.string(),
  categories: z.array(z.string()),
  keywords: z.array(z.string()).nullish(),
  mimetypes: z.array(z.string()).nullish(),
  urls: z.object({
    homepage: z.string(),
    vcs_browser: z.string().nullish(),
    bugtracker: z.string().nullable().optional(),
    help: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    donation: z.string().nullable().optional(),
    translate: z.string().nullable().optional(),
    contribute: z.string().nullable().optional(),
    faq: z.string().nullable().optional(),
  }),
  content_rating_details: z
    .record(
      z.string(),
      z.object({
        minimumAgeText: z.string(),
        minimumAge: z.number().int().nonnegative(),
        categories: z.array(
          z.object({ level: z.string(), description: z.string().nullable(), id: z.string() })
        ),
      })
    )
    .nullish(),
  icon: z.string(),
  screenshots: z.array(
    z.object({
      default: z.boolean().nullish(),
      caption: z.string().nullish(),
      sizes: z.array(
        z.object({
          src: z.string(),
          width: z.string(),
          height: z.string(),
        })
      ),
    })
  ),
});

interface FlathubMedia {
  icon: string;
  screenshots: Array<{
    caption: string;
    captionTranslations?: Record<string, string>;
    source: string | undefined;
  }>;
}

export function readFlathubAppstream(value: unknown) {
  const app = flathubSchema.parse(value);
  const ratings = app.content_rating_details ?? {};
  const rating = ratings.en_US ?? Object.values(ratings)[0];
  const warnings = rating?.categories.flatMap(({ level, description }) =>
    level !== "none" && description ? [description] : []
  );
  const links = projectLinks(app.urls);
  const ratingTranslations = Object.fromEntries(
    Object.entries(ratings).flatMap(([language, translatedRating]) => {
      if (translatedRating === rating) return [];

      const translatedWarnings = translatedRating.categories.flatMap(({ level, description }) =>
        level !== "none" && description ? [description] : []
      );

      return [
        [
          normalizeLocale(language),
          {
            contentRating: {
              label: translatedRating.minimumAgeText,
              ...(translatedWarnings.length ? { warnings: translatedWarnings } : {}),
            },
          },
        ],
      ];
    })
  );

  return appstreamMetadataSchema.parse({
    id: app.id,
    name: app.name,
    summary: app.summary,
    description: parseDescription(app.description),
    projectLicense: app.project_license,
    developer: { name: app.developer_name },
    homepage: app.urls.homepage,
    ...(app.urls.vcs_browser ? { repository: app.urls.vcs_browser } : {}),
    ...(links ? { links } : {}),
    ...(rating
      ? {
          contentRating: {
            label: rating.minimumAgeText,
            minimumAge: rating.minimumAge,
            ...(warnings?.length ? { warnings } : {}),
          },
        }
      : {}),
    ...(app.keywords?.length ? { keywords: app.keywords } : {}),
    categories: app.categories,
    ...(app.mimetypes?.length ? { mimeTypes: app.mimetypes } : {}),
    ...(Object.keys(ratingTranslations).length ? { translations: ratingTranslations } : {}),
  });
}

export function readFlathubAssets(value: unknown): FlathubMedia {
  const app = flathubSchema.parse(value);

  return {
    icon: app.icon,
    screenshots: app.screenshots
      .toSorted((left, right) => Number(right.default) - Number(left.default))
      .slice(0, 10)
      .map((screenshot) => ({
        caption: screenshot.caption?.trim() ? screenshot.caption : `${app.name} screenshot`,
        source:
          screenshot.sizes.find(({ src }) => src.includes("_orig."))?.src ??
          screenshot.sizes.toSorted(
            (left, right) =>
              Number(right.width) * Number(right.height) - Number(left.width) * Number(left.height)
          )[0]?.src,
      })),
  };
}

export function mergeFlathubTranslation(
  metadata: z.infer<typeof appstreamMetadataSchema>,
  media: FlathubMedia,
  value: unknown,
  locale: string
) {
  const localized = readFlathubAppstream(value);

  if (localized.id !== metadata.id) {
    throw new Error(
      `Translated AppStream response has id ${localized.id}, expected ${metadata.id}`
    );
  }

  const translation: Record<string, unknown> = {
    ...metadata.translations?.[normalizeLocale(locale)],
  };
  const addIfDifferent = (field: string, translated: unknown, original: unknown) => {
    if (translated !== undefined && JSON.stringify(translated) !== JSON.stringify(original)) {
      translation[field] = translated;
    }
  };

  addIfDifferent("name", localized.name, metadata.name);
  addIfDifferent("summary", localized.summary, metadata.summary);
  addIfDifferent("description", localized.description, metadata.description);
  addIfDifferent("developerName", localized.developer.name, metadata.developer.name);
  addIfDifferent("keywords", localized.keywords, metadata.keywords);

  const translatedRating: Record<string, unknown> = {};

  if (
    localized.contentRating?.label !== undefined &&
    localized.contentRating.label !== metadata.contentRating?.label
  ) {
    translatedRating.label = localized.contentRating.label;
  }

  if (
    localized.contentRating?.warnings !== undefined &&
    JSON.stringify(localized.contentRating.warnings) !==
      JSON.stringify(metadata.contentRating?.warnings)
  ) {
    translatedRating.warnings = localized.contentRating.warnings;
  }

  if (Object.keys(translatedRating).length) {
    translation.contentRating = translatedRating;
  }

  const normalizedLocale = normalizeLocale(locale);
  const translations = {
    ...metadata.translations,
    ...(Object.keys(translation).length ? { [normalizedLocale]: translation } : {}),
  };
  const localizedScreenshots = new Map(
    readFlathubAssets(value).screenshots.map((screenshot) => [screenshot.source, screenshot])
  );

  return {
    metadata: appstreamMetadataSchema.parse({
      ...metadata,
      ...(Object.keys(translations).length ? { translations } : {}),
    }),
    media: {
      ...media,
      screenshots: media.screenshots.map((screenshot) => {
        const translatedCaption = localizedScreenshots.get(screenshot.source)?.caption;

        return {
          ...screenshot,
          ...(translatedCaption && translatedCaption !== screenshot.caption
            ? {
                captionTranslations: {
                  ...screenshot.captionTranslations,
                  [normalizedLocale]: translatedCaption,
                },
              }
            : {}),
        };
      }),
    },
  };
}

async function fetchFlathubAppstream(id: string, locale: string, label: string) {
  const url = new URL(`https://flathub.org/api/v2/appstream/${encodeURIComponent(id)}`);

  url.searchParams.set("locale", locale);
  const response = await safeFetch(url.toString(), { signal: AbortSignal.timeout(30_000) });

  if (!response.ok) {
    throw new Error(`${label}: ${locale} AppStream request failed with HTTP ${response.status}`);
  }

  return JSON.parse(
    (await readResponse(response, 2 * 1024 * 1024, id)).toString("utf8")
  ) as unknown;
}

export async function readFlathubSource(
  id: string,
  label: string,
  locales: readonly string[],
  defaultLocale: string
) {
  const localizedSources = new Map(
    await Promise.all(
      locales.map(
        async (locale) => [locale, await fetchFlathubAppstream(id, locale, label)] as const
      )
    )
  );
  const defaultSource = localizedSources.get(defaultLocale);
  let metadata = readFlathubAppstream(defaultSource);
  let media = readFlathubAssets(defaultSource);

  for (const locale of locales) {
    if (locale === defaultLocale) continue;

    ({ metadata, media } = mergeFlathubTranslation(
      metadata,
      media,
      localizedSources.get(locale),
      locale
    ));
  }

  if (metadata.id !== id) {
    throw new Error(`${label}: AppStream response has the wrong application id`);
  }

  return { metadata, media };
}
