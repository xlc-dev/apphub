import { z } from "zod";

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

const screenshotSchema = z
  .object({
    file: z.string().regex(/^screenshot-[1-9][0-9]*\.(?:png|jpe?g|webp|avif)$/i),
    caption: z.string().min(1).optional(),
  })
  .strict();

export const appSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/),
    name: z.string().min(1),
    summary: z.string().min(1),
    description: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    homepage: z.url().optional(),
    source: z.enum(["official", "community"]),
    categories: z.array(z.string().min(1)).min(1).optional(),
    releaseSource: releaseSourceSchema,
    screenshots: z
      .array(screenshotSchema)
      .min(1)
      .max(10)
      .refine(
        (screenshots) => new Set(screenshots.map(({ file }) => file)).size === screenshots.length,
        "Screenshot files must be unique"
      ),
    security: z
      .object({
        isolation: z.literal("none"),
        expectedAccess: z
          .array(z.enum(expectedAccess))
          .refine(
            (access) => new Set(access).size === access.length,
            "Access entries must be unique"
          ),
      })
      .strict()
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
    name: z.string().min(1),
    url: z.url(),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const releaseSchema = z
  .object({
    version: z.string().min(1),
    publishedAt: z.iso.datetime(),
    page: z.url(),
    artifacts: z.array(artifactSchema).min(1),
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
    appId: z.string().min(1),
    releases: z.array(releaseSchema),
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
