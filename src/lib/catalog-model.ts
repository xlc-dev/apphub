import { z } from "zod";
import { catalogStatusSchema, refreshStateSchema } from "#catalog/refresh";
import {
  applicationSlugSchema,
  appSchema,
  catalogProvenanceSchema,
  releaseSchema,
} from "#catalog/schema";

const imageTypeSchema = z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]);

const catalogImageSchema = z
  .object({ source: z.url(), url: z.string().min(1), type: imageTypeSchema })
  .strict();

const catalogScreenshotSchema = catalogImageSchema
  .extend({
    caption: z.string().min(1),
    captionTranslations: z.record(z.string(), z.string().min(1)).optional(),
  })
  .strict();

const publicProvenanceSchema = catalogProvenanceSchema
  .extend({
    metadata: catalogProvenanceSchema.shape.metadata.omit({ validator: true }).strict(),
    releaseSource: catalogProvenanceSchema.shape.releaseSource.omit({ validator: true }).strict(),
  })
  .strict();

export const catalogAppSchema = appSchema
  .omit({ assets: true, provenance: true, releaseSource: true, screenshots: true })
  .extend({
    slug: applicationSlugSchema,
    icon: catalogImageSchema,
    screenshots: z.array(catalogScreenshotSchema).min(1).max(5),
    releases: z.array(releaseSchema),
    status: catalogStatusSchema,
    provenance: publicProvenanceSchema,
  })
  .strict();

const catalogStatisticsSchema = z
  .object({
    stars: z.number().int().nonnegative().nullable(),
    downloads: z
      .object({
        updatedAt: z.iso.date().nullable(),
        week: z.number().int().nonnegative().nullable(),
        month: z.number().int().nonnegative().nullable(),
        allTime: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    refresh: z
      .object({
        downloads: refreshStateSchema.optional(),
        stars: refreshStateSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const catalogAppResourceSchema = catalogAppSchema
  .extend({ statistics: catalogStatisticsSchema })
  .strict();

export const catalogAppSummarySchema = catalogAppResourceSchema
  .pick({
    id: true,
    slug: true,
    name: true,
    summary: true,
    projectLicense: true,
    addedAt: true,
    categories: true,
    icon: true,
    status: true,
  })
  .extend({
    statistics: catalogStatisticsSchema.omit({ refresh: true }).strict(),
    origin: z.enum(["upstream", "third-party"]),
    latestRelease: z
      .object({
        version: z.string().min(1).max(200),
        publishedAt: z.iso.datetime(),
        architectures: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const catalogCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const catalogCategoryDetailsSchema = catalogCategorySchema
  .extend({ apps: z.array(catalogAppSummarySchema) })
  .strict();

export const catalogArchitectureSchema = z
  .object({ id: z.string().min(1), count: z.number().int().nonnegative() })
  .strict();

export const catalogArchitectureDetailsSchema = catalogArchitectureSchema
  .extend({ apps: z.array(catalogAppSummarySchema) })
  .strict();

export const catalogNewAppsSchema = z
  .object({ windowDays: z.number().int().positive(), apps: z.array(catalogAppSummarySchema) })
  .strict();

export const catalogUpdatedAppsSchema = z
  .object({ apps: z.array(catalogAppSummarySchema) })
  .strict();

const rankingPeriodSchema = z.enum(["week", "month", "all-time"]);

export function isAppIndexable(app: { status: z.infer<typeof catalogStatusSchema> }) {
  return app.status !== "quarantined";
}

export const catalogRankingSchema = z
  .object({
    period: rankingPeriodSchema,
    entries: z
      .array(
        z
          .object({ app: catalogAppSummarySchema, downloads: z.number().int().nonnegative() })
          .strict()
      )
      .nullable(),
  })
  .strict();

export type CatalogApp = z.infer<typeof catalogAppSchema>;
export type CatalogAppResource = z.infer<typeof catalogAppResourceSchema>;
export type CatalogAppSummary = z.infer<typeof catalogAppSummarySchema>;
export type RankingPeriod = z.infer<typeof rankingPeriodSchema>;
