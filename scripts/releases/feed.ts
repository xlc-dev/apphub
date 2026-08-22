import { z } from "zod";
import type { ReleaseLock } from "@catalog/core";
import type { App } from "@catalog/schema";
import { getJson } from "./http";
import { normalizeDate, selectCurrent } from "./model";

const httpsUrl = z.url().refine((value) => new URL(value).protocol === "https:");

const feedSchema = z
  .object({
    releases: z.array(
      z
        .object({
          version: z.string().min(1).max(200),
          publishedAt: z.iso.datetime({ offset: true }),
          page: httpsUrl,
          artifacts: z
            .array(
              z
                .object({
                  architecture: z.string().regex(/^[a-z0-9][a-z0-9_+-]*$/),
                  name: z.string().min(1).max(255),
                  url: httpsUrl,
                  size: z.number().int().positive(),
                  sha256: z
                    .string()
                    .regex(/^[a-f0-9]{64}$/)
                    .optional(),
                })
                .strict()
            )
            .min(1)
            .max(50),
        })
        .strict()
    ),
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
