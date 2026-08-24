import { z } from "zod";
import type { ReleaseLock } from "#catalog/core";
import { architectureSchema, httpsUrlSchema, type App } from "#catalog/schema";
import { getJson } from "#scripts/releases/http";
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
    artifacts: release.artifacts.map(({ sha256, ...artifact }) => ({
      ...artifact,
      ...(sha256 ? { sha256 } : {}),
    })),
  }));

  return selectCurrent(releases, lock, source);
}

export async function fetchFeedReleases(app: App, lock: ReleaseLock) {
  const source = feedUrl(app);

  return feedSourceReleases(app, lock, await getJson(source));
}
