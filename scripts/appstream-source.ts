import type { AppManifest, AppstreamMetadata } from "#catalog/schema";
import { readAppstreamXml } from "#catalog/appstream";
import { readFlathubSource } from "#catalog/flathub";
import { conditionalHeaders, readResponse, responseValidator, safeFetch } from "#catalog/http";
import type { HttpValidator } from "#catalog/refresh";
import { defaultLocale, locales } from "#lib/locales";

interface CachedSource {
  metadata: AppstreamMetadata;
  media: {
    icon: { source: string };
    screenshots: Array<{
      caption: string;
      captionTranslations?: Record<string, string> | undefined;
      source: string;
    }>;
  };
  validator?: HttpValidator;
}

export async function readAppstreamSource(
  source: AppManifest["appstream"],
  label: string,
  cached?: CachedSource
) {
  if (source.type === "manual") {
    return {
      metadata: source.metadata,
      media: source.media,
      provenance: {
        provider: "manifest" as const,
        providerId: source.metadata.id,
      },
    };
  }

  if (source.type === "flathub") {
    return {
      ...(await readFlathubSource(source.id, label, locales, defaultLocale)),
      provenance: {
        provider: "flathub" as const,
        providerId: source.id,
        sourceUrl: `https://flathub.org/api/v2/appstream/${encodeURIComponent(source.id)}`,
      },
    };
  }

  const response = await safeFetch(source.url, {
    headers: conditionalHeaders(cached?.validator),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 304) {
    if (!cached?.validator) {
      throw new Error(`${label}: AppStream returned 304 without cached metadata`);
    }

    return {
      metadata: cached.metadata,
      media: {
        icon: cached.media.icon.source,
        screenshots: cached.media.screenshots.map(
          ({ caption, captionTranslations, source: screenshotSource }) => ({
            caption,
            ...(captionTranslations ? { captionTranslations } : {}),
            source: screenshotSource,
          })
        ),
      },
      provenance: {
        provider: "url" as const,
        providerId: source.id,
        sourceUrl: source.url,
        validator: cached.validator,
      },
    };
  }

  if (!response.ok) {
    throw new Error(`${label}: AppStream request failed with HTTP ${response.status}`);
  }

  const xml = await readResponse(response, 2 * 1024 * 1024, source.url);
  const document = readAppstreamXml(xml.toString("utf8"), source.id);
  const validator = responseValidator(response);

  return {
    metadata: document.metadata,
    media: {
      icon: document.media.icon ?? source.media?.icon,
      screenshots: document.media.screenshots ?? source.media?.screenshots ?? [],
    },
    provenance: {
      provider: "url" as const,
      providerId: source.id,
      sourceUrl: source.url,
      ...(validator ? { validator } : {}),
    },
  };
}
