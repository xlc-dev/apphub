import { z } from "zod";
import parseSpdxExpression from "spdx-expression-parse";
import { sandboxV1Schema } from "#catalog/sandbox-v1";

const apiPathSchema = z.string().min(1);
const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Must use HTTPS",
});
const appIdSchema = z
  .string()
  .min(2)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/);
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const architectureSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_+-]*$/)
  .describe("Linux architecture name");
const localeSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/);
const statusSchema = z.enum(["current", "stale", "unavailable", "quarantined"]);
const incidentCategorySchema = z.enum([
  "network",
  "rate-limit",
  "not-found",
  "invalid-data",
  "integrity",
]);

const uniqueBy = <T>(values: T[], key: (value: T) => string) =>
  new Set(values.map(key)).size === values.length;

function isSpdxExpression(value: string) {
  try {
    parseSpdxExpression(value);

    return true;
  } catch {
    return false;
  }
}

const imageSchema = z
  .object({
    source: z.url(),
    url: apiPathSchema,
    type: z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]),
  })
  .strict();

const screenshotSchema = imageSchema
  .extend({
    caption: z.string().min(1),
    captionTranslations: z.record(z.string(), z.string().min(1)).optional(),
  })
  .strict();

const descriptionTextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().min(1).max(10_000) }).strict(),
  z.object({ type: z.literal("emphasis"), value: z.string().min(1).max(10_000) }).strict(),
  z.object({ type: z.literal("code"), value: z.string().min(1).max(10_000) }).strict(),
]);

const descriptionBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("paragraph"),
      content: z.array(descriptionTextSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.enum(["ordered-list", "unordered-list"]),
      items: z.array(z.array(descriptionTextSchema).min(1).max(100)).min(1).max(100),
    })
    .strict(),
]);

const contentRatingSchema = z
  .object({
    scheme: z.string().min(1).max(50).optional(),
    label: z.string().min(1).max(100).optional(),
    minimumAge: z.number().int().min(0).max(21).optional(),
    warnings: z.array(z.string().min(1).max(500)).max(50).optional(),
  })
  .strict()
  .refine((rating) => Object.values(rating).some((value) => value !== undefined), {
    message: "Content rating must not be empty",
  });

const translationSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    summary: z.string().min(1).max(200).optional(),
    description: z.array(descriptionBlockSchema).min(1).max(100).optional(),
    developerName: z.string().min(1).max(100).optional(),
    keywords: z.array(z.string().min(1).max(100)).max(50).optional(),
    contentRating: z
      .object({
        label: z.string().min(1).max(100).optional(),
        warnings: z.array(z.string().min(1).max(500)).max(50).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((translation) => Object.values(translation).some((value) => value !== undefined), {
    message: "Translation must not be empty",
  });

const originSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("third-party") }).strict(),
  z
    .object({
      type: z.literal("upstream"),
      evidence: z
        .object({
          method: z.enum(["upstream-repository", "upstream-link"]),
          url: httpsUrlSchema,
        })
        .strict(),
    })
    .strict(),
]);

const refreshStateSchema = z
  .object({
    lastAttemptAt: z.iso.datetime(),
    lastSuccessAt: z.iso.datetime().optional(),
    incident: z
      .object({
        category: incidentCategorySchema,
        consecutiveFailures: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

const successfulRefreshStateSchema = refreshStateSchema
  .extend({ lastSuccessAt: z.iso.datetime() })
  .strict();

const provenanceSchema = z
  .object({
    metadata: z
      .object({
        provider: z.enum(["manifest", "flathub", "url"]),
        sourceUrl: httpsUrlSchema.optional(),
        providerId: z.string().min(1).max(255).optional(),
      })
      .strict(),
    releaseSource: z
      .object({
        provider: z.enum(["github", "gitlab", "codeberg", "feed"]),
        configuredUrl: httpsUrlSchema,
        sourceUrl: httpsUrlSchema,
        projectId: z.string().min(1).max(255).optional(),
        ownerId: z.string().min(1).max(255).optional(),
      })
      .strict(),
    refresh: z
      .object({
        metadata: successfulRefreshStateSchema,
        releases: successfulRefreshStateSchema,
      })
      .strict(),
  })
  .strict();

const downloadsSchema = z
  .object({
    updatedAt: z.iso.date().nullable(),
    week: z.number().int().nonnegative().nullable(),
    month: z.number().int().nonnegative().nullable(),
    allTime: z.number().int().nonnegative().nullable(),
  })
  .strict();

const statisticsSchema = z
  .object({
    stars: z.number().int().nonnegative().nullable(),
    downloads: downloadsSchema,
    refresh: z
      .object({
        downloads: refreshStateSchema.optional(),
        stars: refreshStateSchema.optional(),
      })
      .strict(),
  })
  .strict();

const artifactSchema = z
  .object({
    architecture: architectureSchema,
    name: z.string().min(1).max(255),
    url: httpsUrlSchema,
    assetId: z.string().min(1).max(255).optional(),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    checksumEvidence: z.object({ sourceUrl: httpsUrlSchema }).strict().optional(),
    signatures: z
      .array(
        z
          .object({
            kind: z.string().min(1).max(50),
            url: httpsUrlSchema,
          })
          .strict()
      )
      .max(10)
      .optional(),
  })
  .strict();

const releaseSchema = z
  .object({
    version: z.string().min(1).max(200),
    publishedAt: z.iso.datetime(),
    page: httpsUrlSchema,
    releaseId: z.string().min(1).max(255).optional(),
    artifacts: z.array(artifactSchema).min(1).max(10),
  })
  .strict()
  .refine(
    (release) => uniqueBy(release.artifacts, ({ architecture }) => architecture),
    "Release architectures must be unique"
  );

export const apiAppResourceSchema = z
  .object({
    id: appIdSchema,
    slug: slugSchema,
    name: z.string().min(1).max(100),
    summary: z.string().min(1).max(200),
    description: z
      .array(descriptionBlockSchema)
      .min(1)
      .max(100)
      .refine((blocks) => JSON.stringify(blocks).length <= 100_000, "Description is too large"),
    projectLicense: z
      .string()
      .min(1)
      .max(100)
      .refine(isSpdxExpression, "Must be a valid SPDX license expression"),
    developer: z.object({ name: z.string().min(1).max(100) }).strict(),
    homepage: httpsUrlSchema,
    repository: httpsUrlSchema.optional(),
    links: z
      .partialRecord(
        z.enum(["bugtracker", "help", "contact", "donation", "translate", "contribute", "faq"]),
        httpsUrlSchema
      )
      .optional(),
    contentRating: contentRatingSchema.optional(),
    keywords: z
      .array(z.string().min(1).max(100))
      .max(50)
      .refine(
        (keywords) =>
          new Set(keywords.map((keyword) => keyword.toLowerCase())).size === keywords.length,
        "Keywords must be unique"
      )
      .optional(),
    categories: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .refine((categories) => new Set(categories).size === categories.length, {
        message: "Categories must be unique",
      }),
    mimeTypes: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i))
      .max(100)
      .refine(
        (mimeTypes) =>
          new Set(mimeTypes.map((mimeType) => mimeType.toLowerCase())).size === mimeTypes.length,
        "MIME types must be unique"
      )
      .optional(),
    translations: z.record(localeSchema, translationSchema).optional(),
    addedAt: z.iso.date(),
    origin: originSchema,
    icon: imageSchema,
    screenshots: z.array(screenshotSchema).min(1).max(5),
    sandbox: sandboxV1Schema,
    status: statusSchema,
    provenance: provenanceSchema,
    statistics: statisticsSchema,
    latestRelease: releaseSchema.nullable(),
    url: apiPathSchema,
    webUrl: apiPathSchema,
  })
  .strict();

export const apiAppSummarySchema = apiAppResourceSchema
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
    url: true,
    webUrl: true,
  })
  .extend({
    origin: z.enum(["upstream", "third-party"]),
    statistics: statisticsSchema.omit({ refresh: true }).strict(),
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

export const apiCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    count: z.number().int().nonnegative(),
    url: apiPathSchema,
    webUrl: apiPathSchema,
  })
  .strict();

export const apiArchitectureSchema = z
  .object({
    id: z.string().min(1),
    count: z.number().int().nonnegative(),
    url: apiPathSchema,
  })
  .strict();

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
    previous: apiPathSchema.nullable(),
    next: apiPathSchema.nullable(),
  })
  .strict();

export const apiSummaryPageSchema = apiSnapshotSchema
  .extend({ pagination: apiPaginationSchema, items: z.array(apiAppSummarySchema) })
  .strict();

const apiFilterSchema = z
  .object({ type: z.enum(["category", "architecture"]), id: z.string().min(1) })
  .strict();

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

export const apiAppDetailSchema = apiSnapshotSchema.extend({ app: apiAppResourceSchema }).strict();

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
