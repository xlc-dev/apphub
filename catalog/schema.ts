import { z } from "zod";
import parseSpdxExpression from "spdx-expression-parse";
import { mainCategories, registeredCategories } from "#catalog/categories";

export const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Must use HTTPS",
});

export const architectureSchema = z
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

const filesystemLocationSchema = z.enum([
  "home",
  "desktop",
  "documents",
  "downloads",
  "music",
  "pictures",
  "public-share",
  "templates",
  "videos",
  "removable-media",
]);

const filesystemRuleSchema = z
  .object({
    location: filesystemLocationSchema,
    access: z.enum(["read-only", "read-write"]),
  })
  .strict();

const busNameSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)+$/);

const busRuleSchema = z
  .object({
    name: busNameSchema,
    access: z.enum(["see", "talk", "own"]),
  })
  .strict();

const uniqueBy = <T>(values: T[], key: (value: T) => string) =>
  new Set(values.map(key)).size === values.length;

const sandboxSchema = z
  .object({
    network: z.enum(["none", "client", "client-and-server"]),
    display: z.enum(["none", "wayland", "x11", "wayland-and-x11"]),
    audio: z.enum(["none", "playback", "capture", "playback-and-capture"]),
    processes: z.enum(["isolated", "read", "control"]),
    ipc: z.boolean(),
    filesystem: z
      .array(filesystemRuleSchema)
      .max(filesystemLocationSchema.options.length)
      .refine(
        (rules) => uniqueBy(rules, ({ location }) => location),
        "Filesystem locations must be unique"
      ),
    devices: z
      .array(z.enum(["gpu", "input", "camera", "usb", "serial", "optical", "fuse", "kvm"]))
      .max(8)
      .refine((devices) => uniqueBy(devices, (device) => device), "Devices must be unique"),
    portals: z
      .array(
        z.enum([
          "background",
          "camera",
          "email",
          "file-chooser",
          "inhibit",
          "location",
          "notifications",
          "open-uri",
          "printing",
          "screenshot",
          "screencast",
          "secrets",
          "settings",
        ])
      )
      .max(13)
      .refine((portals) => uniqueBy(portals, (portal) => portal), "Portals must be unique"),
    sessionBus: z
      .array(busRuleSchema)
      .max(50)
      .refine((rules) => uniqueBy(rules, ({ name }) => name), "Session bus names must be unique"),
    systemBus: z
      .array(busRuleSchema)
      .max(50)
      .refine((rules) => uniqueBy(rules, ({ name }) => name), "System bus names must be unique"),
  })
  .strict()
  .describe(
    "Minimum host access required by the application; unspecified access is denied and private application storage is implicit"
  );

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
    source: httpsUrlSchema,
  })
  .strict();

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

const developerSchema = z
  .object({
    name: z.string().min(1).max(100),
    url: httpsUrlSchema.optional(),
  })
  .strict();

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
            source: httpsUrlSchema,
          })
          .strict()
      )
      .min(1)
      .max(10),
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
      media: upstreamMediaSchema,
    })
    .strict(),
]);

export const generatedMediaSchema = z
  .object({
    icon: z
      .object({
        file: z.string().regex(/^icon\.(?:png|jpe?g|webp|avif)$/i),
        source: httpsUrlSchema,
      })
      .strict(),
    screenshots: z.array(screenshotSchema).min(1).max(10),
  })
  .strict();

export const appManifestSchema = z
  .object({
    appstream: appstreamSourceSchema,
    addedAt: z.iso.date(),
    source: z.enum(["official", "community"]),
    deprecated: z.boolean().optional(),
    replacedBy: generatedAppstreamFields.id.optional(),
    releaseSource: releaseSourceSchema,
    sandbox: sandboxSchema,
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
    source: z.enum(["official", "community"]),
    deprecated: z.boolean().optional(),
    replacedBy: generatedAppstreamFields.id.optional(),
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
    sandbox: sandboxSchema,
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
export type AppManifest = z.infer<typeof appManifestSchema>;
export type AppstreamMetadata = z.infer<typeof appstreamMetadataSchema>;
export type GeneratedMedia = z.infer<typeof generatedMediaSchema>;
export type DescriptionBlock = z.infer<typeof descriptionBlockSchema>;
export type Architecture = z.infer<typeof architectureSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ReleaseLock = z.infer<typeof releaseLockSchema>;
