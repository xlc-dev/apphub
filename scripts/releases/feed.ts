import { z } from "zod";
import { architectureSchema, httpsUrlSchema, type App, type ReleaseLock } from "#catalog/schema";
import type { HttpValidator } from "#catalog/refresh";
import { getJsonConditional } from "#scripts/releases/http";
import { normalizeDate, selectCurrent } from "#scripts/releases/model";

const feedSchema = z
  .object({
    releases: z
      .array(
        z
          .object({
            version: z.string().min(1).max(200),
            publishedAt: z.iso.datetime({ offset: true }),
            page: httpsUrlSchema,
            artifacts: z
              .array(
                z
                  .object({
                    architecture: architectureSchema,
                    name: z.string().min(1).max(255),
                    url: httpsUrlSchema,
                    size: z.number().int().positive(),
                    sha256: z
                      .string()
                      .regex(/^[a-f0-9]{64}$/)
                      .optional(),
                    signatures: z
                      .array(
                        z.object({ kind: z.string().min(1).max(50), url: httpsUrlSchema }).strict()
                      )
                      .max(10)
                      .optional(),
                  })
                  .strict()
              )
              .min(1)
              .max(10),
          })
          .strict()
      )
      .max(1_000),
  })
  .strict();

function feedUrl(app: App) {
  if (app.releaseSource.type !== "feed") {
    throw new Error("Expected a feed source");
  }

  return app.releaseSource.url;
}

export function feedSourceReleases(app: App, lock: ReleaseLock, input: unknown) {
  const source = feedUrl(app);
  const data = feedSchema.parse(input);
  const releases = data.releases.map((release) => ({
    ...release,
    publishedAt: normalizeDate(release.publishedAt),
    artifacts: release.artifacts.map(({ sha256, signatures, ...artifact }) => ({
      ...artifact,
      ...(sha256
        ? {
            publishedSha256: { value: sha256, sourceUrl: source },
          }
        : {}),
      ...(signatures ? { signatures } : {}),
    })),
  }));

  return selectCurrent(releases, lock, source);
}

export async function fetchFeedReleases(app: App, lock: ReleaseLock, validator?: HttpValidator) {
  const source = feedUrl(app);
  const response = await getJsonConditional(source, undefined, validator);

  if (response.notModified) {
    return {
      source: { provider: "feed" as const, sourceUrl: source, validator: response.validator },
      releases: [],
      notModified: true,
    };
  }

  return {
    source: {
      provider: "feed" as const,
      sourceUrl: source,
      ...(response.validator ? { validator: response.validator } : {}),
    },
    releases: feedSourceReleases(app, lock, response.value),
  };
}
