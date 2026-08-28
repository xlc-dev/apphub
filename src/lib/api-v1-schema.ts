import { z } from "zod";
import { releaseSchema } from "#catalog/schema";
import { facetTypes } from "#lib/facets";
import {
  catalogAppResourceSchema,
  catalogAppSummarySchema,
  catalogArchitectureSchema,
  catalogCategorySchema,
} from "#lib/catalog-model";

const apiCategorySchema = catalogCategorySchema
  .extend({ url: z.string().min(1), webUrl: z.string().min(1) })
  .strict();

const apiAppResourceSchema = catalogAppResourceSchema
  .extend({ url: z.string().min(1), webUrl: z.string().min(1) })
  .strict();

export const apiAppSummarySchema = catalogAppSummarySchema
  .extend({ url: z.string().min(1), webUrl: z.string().min(1) })
  .strict();

const apiArchitectureSchema = catalogArchitectureSchema.extend({ url: z.string().min(1) }).strict();

const apiSnapshotSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export const apiPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
    previous: z.string().min(1).nullable(),
    next: z.string().min(1).nullable(),
  })
  .strict();

export const apiSummaryPageSchema = apiSnapshotSchema
  .extend({ pagination: apiPaginationSchema, items: z.array(apiAppSummarySchema) })
  .strict();

const apiFilterSchema = z.object({ type: z.enum(facetTypes), id: z.string().min(1) }).strict();

export const apiFilteredPageSchema = apiSummaryPageSchema
  .extend({ filter: apiFilterSchema })
  .strict();

export const apiNewPageSchema = apiSummaryPageSchema
  .extend({ windowDays: z.number().int().positive() })
  .strict();

const apiRankingEntrySchema = z
  .object({ app: apiAppSummarySchema, downloads: z.number().int().nonnegative() })
  .strict();

export const apiRankingPageSchema = apiSnapshotSchema
  .extend({
    period: z.enum(["week", "month", "all-time"]),
    pagination: apiPaginationSchema.nullable(),
    items: z.array(apiRankingEntrySchema).nullable(),
  })
  .strict();

export const apiAppDetailSchema = apiSnapshotSchema
  .extend({
    app: apiAppResourceSchema
      .omit({ releases: true })
      .extend({ latestRelease: releaseSchema.nullable() })
      .strict(),
  })
  .strict();

export const apiCategoryListSchema = apiSnapshotSchema
  .extend({ items: z.array(apiCategorySchema) })
  .strict();

export const apiArchitectureListSchema = apiSnapshotSchema
  .extend({ items: z.array(apiArchitectureSchema) })
  .strict();

export const apiMetadataV1Schema = apiSnapshotSchema
  .extend({
    version: z.literal("v1"),
    freshness: z
      .object({
        downloadsUpdatedAt: z.iso.date().nullable(),
        staleResources: z.number().int().nonnegative(),
        statuses: z
          .object({
            current: z.number().int().nonnegative(),
            stale: z.number().int().nonnegative(),
            unavailable: z.number().int().nonnegative(),
            quarantined: z.number().int().nonnegative(),
          })
          .strict(),
        incidents: z
          .object({
            network: z.number().int().nonnegative(),
            rateLimit: z.number().int().nonnegative(),
            notFound: z.number().int().nonnegative(),
            invalidData: z.number().int().nonnegative(),
            integrity: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    counts: z
      .object({
        apps: z.number().int().nonnegative(),
        categories: z.number().int().nonnegative(),
        architectures: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const apiV1ResourceSchema = z.union([
  apiMetadataV1Schema,
  apiSummaryPageSchema,
  apiFilteredPageSchema,
  apiNewPageSchema,
  apiRankingPageSchema,
  apiAppDetailSchema,
  apiCategoryListSchema,
  apiArchitectureListSchema,
]);

export const apiV1JsonSchema = {
  ...z.toJSONSchema(apiV1ResourceSchema, {
    target: "draft-2020-12",
    reused: "ref",
  }),
  title: "AppHub API v1",
  description: "Responses published under /api/v1, excluding this schema resource.",
};

export type ApiPagination = z.infer<typeof apiPaginationSchema>;
export type ApiSnapshot = z.infer<typeof apiSnapshotSchema>;
export type ApiAppResource = z.infer<typeof apiAppResourceSchema>;
export type ApiAppSummary = z.infer<typeof apiAppSummarySchema>;
export type ApiArchitecture = z.infer<typeof apiArchitectureSchema>;
export type ApiArchitectureDetails = ApiArchitecture & { apps: ApiAppSummary[] };
export type ApiCategory = z.infer<typeof apiCategorySchema>;
export type ApiCategoryDetails = ApiCategory & { apps: ApiAppSummary[] };
