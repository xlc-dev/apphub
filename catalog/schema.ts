import { z } from "zod";
import parseSpdxExpression from "spdx-expression-parse";
import { mainCategories, registeredCategories } from "@catalog/categories";

const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Must use HTTPS",
});

const architectureSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_+-]*$/)
  .describe("Linux architecture name");

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
    .object({ type: z.literal("feed"), url: httpsUrlSchema })
    .strict()
    .describe("Release metadata is read from an AppHub JSON release feed"),
  z
    .object({ type: z.literal("direct") })
    .strict()
    .describe("Release metadata and artifact URLs are maintained in releases.json"),
]);

const expectedAccess = [
  "network",
  "home-files",
  "removable-media",
  "devices",
  "session-bus",
  "system-bus",
] as const;

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

const screenshotSchema = z
  .object({
    file: z.string().regex(/^screenshot-[1-9][0-9]*\.(?:png|jpe?g|webp|avif)$/i),
    caption: z.string().min(1).max(200),
    license: z
      .string()
      .min(1)
      .max(100)
      .refine(isSpdxExpression, "Must be a valid SPDX license expression"),
    source: httpsUrlSchema,
  })
  .strict();

const iconSchema = z
  .object({
    license: z
      .string()
      .min(1)
      .max(100)
      .refine(isSpdxExpression, "Must be a valid SPDX license expression"),
    source: httpsUrlSchema,
  })
  .strict();

export const appSchema = z
  .object({
    id: z
      .string()
      .min(2)
      .max(255)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/),
    name: z.string().min(1).max(100),
    summary: z.string().min(1).max(200),
    description: z.string().min(1).max(10_000),
    projectLicense: z
      .string()
      .min(1)
      .max(100)
      .refine(isSpdxExpression, "Must be a valid SPDX license expression"),
    developer: z
      .object({
        name: z.string().min(1).max(100),
        url: httpsUrlSchema.optional(),
      })
      .strict(),
    homepage: httpsUrlSchema,
    repository: httpsUrlSchema.optional(),
    addedAt: z.iso.date(),
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
      .refine(
        (categories) => new Set(categories).size === categories.length,
        "Categories must be unique"
      )
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
    source: z.enum(["official", "community"]),
    deprecated: z.boolean().optional(),
    replacedBy: z
      .string()
      .min(2)
      .max(255)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/)
      .optional(),
    releaseSource: releaseSourceSchema,
    icon: iconSchema,
    screenshots: z
      .array(screenshotSchema)
      .min(1)
      .max(10)
      .refine(
        (screenshots) => new Set(screenshots.map(({ file }) => file)).size === screenshots.length,
        "Screenshot files must be unique"
      ),
    expectedAccess: z
      .array(z.enum(expectedAccess))
      .max(expectedAccess.length)
      .refine((access) => new Set(access).size === access.length, "Access entries must be unique")
      .describe(
        "Expected application behavior, not enforced permissions; AppImages run unsandboxed as the user"
      ),
    assets: z
      .record(architectureSchema, assetPattern)
      .refine((assets) => Object.keys(assets).length > 0, "At least one asset is required")
      .optional(),
  })
  .strict()
  .meta({ title: "AppHub application" });

const artifactSchema = z
  .object({
    architecture: architectureSchema,
    name: z.string().min(1).max(255),
    url: httpsUrlSchema,
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const releaseSchema = z
  .object({
    version: z.string().min(1).max(200),
    publishedAt: z.iso.datetime(),
    page: httpsUrlSchema,
    artifacts: z.array(artifactSchema).min(1).max(50),
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
    releases: z.array(releaseSchema).max(1_000),
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
export type Architecture = z.infer<typeof architectureSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ReleaseLock = z.infer<typeof releaseLockSchema>;
