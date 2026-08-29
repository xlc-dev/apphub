import { z } from "zod";
import parseSpdxExpression from "spdx-expression-parse";
import { mainCategories, registeredCategories } from "#catalog/category-registry";
import { httpValidatorSchema, successfulRefreshStateSchema } from "#catalog/refresh";
import { sandboxV1Schema } from "#catalog/sandbox-v1";

export const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Must use HTTPS",
});

export const architectureSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_+-]*$/)
  .describe("Linux architecture name");

export const applicationSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const assetPattern = z
  .string()
  .min(1)
  .refine(
    (pattern) => !pattern.includes("/") && pattern.endsWith(".AppImage"),
    "Must be a filename pattern ending in .AppImage"
  );

const releaseSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("github"),
      repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("gitlab"),
      repository: z.string().regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("codeberg"),
      repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    })
    .strict(),
  z
    .object({ type: z.literal("feed"), url: httpsUrlSchema })
    .strict()
    .describe("Release metadata is read from an AppHub JSON release feed"),
]);

export const originSchema = z.discriminatedUnion("type", [
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

const resourceProvenanceSchema = z
  .object({
    provider: z.enum(["manifest", "flathub", "url"]),
    sourceUrl: httpsUrlSchema.optional(),
    providerId: z.string().min(1).max(255).optional(),
    validator: httpValidatorSchema.optional(),
  })
  .strict();

const releaseSourceProvenanceSchema = z
  .object({
    provider: z.enum(["github", "gitlab", "codeberg", "feed"]),
    configuredUrl: httpsUrlSchema,
    sourceUrl: httpsUrlSchema,
    projectId: z.string().min(1).max(255).optional(),
    ownerId: z.string().min(1).max(255).optional(),
    validator: httpValidatorSchema.optional(),
  })
  .strict();

export const catalogProvenanceSchema = z
  .object({
    metadata: resourceProvenanceSchema,
    releaseSource: releaseSourceProvenanceSchema,
    refresh: z
      .object({
        metadata: successfulRefreshStateSchema,
        releases: successfulRefreshStateSchema,
      })
      .strict(),
  })
  .strict();

const categorySchema = z
  .string()
  .refine((category) => registeredCategories.has(category), "Must be a registered category");

function isSpdxExpression(value: string) {
  try {
    parseSpdxExpression(value);

    return true;
  } catch {
    return false;
  }
}

const mimeTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i);

const mediaFileSchema = z.string().regex(/^[a-f0-9]{64}\.webp$/);

const screenshotSchema = z
  .object({
    file: mediaFileSchema,
    caption: z.string().min(1).max(200),
    captionTranslations: z
      .record(
        z.string().regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/),
        z.string().min(1).max(200)
      )
      .optional(),
    source: httpsUrlSchema,
  })
  .strict();

const captionTranslationsSchema = z.record(
  z.string().regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/),
  z.string().min(1).max(200)
);

const iconSchema = z
  .object({
    source: httpsUrlSchema,
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

const developerSchema = z.object({ name: z.string().min(1).max(100) }).strict();

const projectLinkTypeSchema = z.enum([
  "bugtracker",
  "help",
  "contact",
  "donation",
  "translate",
  "contribute",
  "faq",
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

const localeTagSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/);

const appstreamTranslationSchema = z
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

const generatedAppstreamFields = {
  id: z
    .string()
    .min(2)
    .max(255)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/),
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
  developer: developerSchema,
  homepage: httpsUrlSchema,
  repository: httpsUrlSchema.optional(),
  links: z.partialRecord(projectLinkTypeSchema, httpsUrlSchema).optional(),
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
    .array(categorySchema)
    .min(1)
    .max(20)
    .refine((categories) => new Set(categories).size === categories.length, {
      message: "Categories must be unique",
    })
    .refine(
      (categories) => categories.some((category) => mainCategories.has(category)),
      "At least one main category is required"
    ),
  mimeTypes: z
    .array(mimeTypeSchema)
    .max(100)
    .refine(
      (mimeTypes) =>
        new Set(mimeTypes.map((mimeType) => mimeType.toLowerCase())).size === mimeTypes.length,
      "MIME types must be unique"
    )
    .optional(),
  translations: z.record(localeTagSchema, appstreamTranslationSchema).optional(),
};

export const appstreamMetadataSchema = z.object(generatedAppstreamFields).strict();

const upstreamMediaSchema = z
  .object({
    icon: httpsUrlSchema,
    screenshots: z
      .array(
        z
          .object({
            caption: z.string().min(1).max(200),
            captionTranslations: captionTranslationsSchema.optional(),
            source: httpsUrlSchema,
          })
          .strict()
      )
      .min(1)
      .max(5),
  })
  .strict();

const mediaOverridesSchema = z
  .object({
    icon: httpsUrlSchema.optional(),
    screenshots: upstreamMediaSchema.shape.screenshots.optional(),
  })
  .strict();

const appstreamSourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("manual"),
      metadata: appstreamMetadataSchema,
      media: upstreamMediaSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("flathub"),
      id: generatedAppstreamFields.id,
    })
    .strict(),
  z
    .object({
      type: z.literal("url"),
      id: generatedAppstreamFields.id,
      url: httpsUrlSchema,
      media: mediaOverridesSchema.optional(),
    })
    .strict(),
]);

export const generatedMediaSchema = z
  .object({
    icon: z
      .object({
        file: mediaFileSchema,
        source: httpsUrlSchema,
        validator: httpValidatorSchema.optional(),
      })
      .strict(),
    screenshots: z
      .array(screenshotSchema.extend({ validator: httpValidatorSchema.optional() }).strict())
      .min(1)
      .max(5),
  })
  .strict();

export const appManifestSchema = z
  .object({
    appstream: appstreamSourceSchema,
    addedAt: z.iso.date(),
    origin: originSchema,
    releaseSource: releaseSourceSchema,
    sandbox: sandboxV1Schema,
    assets: z
      .record(architectureSchema, assetPattern)
      .refine((assets) => Object.keys(assets).length > 0, "At least one asset is required")
      .optional(),
  })
  .strict()
  .meta({ title: "AppHub application manifest" });

export const appSchema = z
  .object({
    ...generatedAppstreamFields,
    addedAt: z.iso.date(),
    origin: originSchema,
    provenance: catalogProvenanceSchema,
    releaseSource: releaseSourceSchema,
    icon: iconSchema,
    screenshots: z
      .array(screenshotSchema)
      .min(1)
      .max(5)
      .refine(
        (screenshots) => new Set(screenshots.map(({ file }) => file)).size === screenshots.length,
        "Screenshot files must be unique"
      ),
    sandbox: sandboxV1Schema,
    assets: z
      .record(architectureSchema, assetPattern)
      .refine((assets) => Object.keys(assets).length > 0, "At least one asset is required")
      .optional(),
  })
  .strict()
  .meta({ title: "AppHub application" });

const checksumEvidenceSchema = z.object({ sourceUrl: httpsUrlSchema }).strict();

const signatureEvidenceSchema = z
  .object({
    kind: z.string().min(1).max(50),
    url: httpsUrlSchema,
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
    checksumEvidence: checksumEvidenceSchema.optional(),
    signatures: z.array(signatureEvidenceSchema).max(10).optional(),
  })
  .strict();

export const releaseSchema = z
  .object({
    version: z.string().min(1).max(200),
    publishedAt: z.iso.datetime(),
    page: httpsUrlSchema,
    releaseId: z.string().min(1).max(255).optional(),
    artifacts: z.array(artifactSchema).min(1).max(10),
  })
  .strict()
  .refine(
    (release) =>
      new Set(release.artifacts.map((artifact) => artifact.architecture)).size ===
      release.artifacts.length,
    "Release architectures must be unique"
  );

export const releaseLockSchema = z
  .object({
    appId: z.string().min(1).max(255),
    releases: z.array(releaseSchema).max(1),
  })
  .strict()
  .refine(
    (lock) =>
      lock.releases.every(
        (release, index) =>
          index === 0 || release.publishedAt <= lock.releases[index - 1]!.publishedAt
      ),
    "Releases must be ordered newest first"
  )
  .refine(
    (lock) =>
      new Set(lock.releases.map((release) => release.version)).size === lock.releases.length,
    "Release versions must be unique"
  );

export type App = z.infer<typeof appSchema>;
export type AppManifest = z.infer<typeof appManifestSchema>;
export type AppstreamMetadata = z.infer<typeof appstreamMetadataSchema>;
export type CatalogProvenance = z.infer<typeof catalogProvenanceSchema>;
export type Origin = z.infer<typeof originSchema>;
export type DescriptionBlock = z.infer<typeof descriptionBlockSchema>;
export type Architecture = z.infer<typeof architectureSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ReleaseLock = z.infer<typeof releaseLockSchema>;
