import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { catalogSnapshotSchema } from "#catalog/snapshot";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaFileSchema = z.string().regex(/^[a-f0-9]{64}\.webp$/);
const mediaTagSchema = z.string().regex(/^media-(?:[0-9]{4,}|[a-f0-9]{64})$/);
export const maximumAssetsPerMediaRelease = 900;

const mappedAssetSchema = z
  .object({
    tag: mediaTagSchema,
    sha256: hashSchema,
    size: z.number().int().positive(),
  })
  .strict();

export const githubMediaMapSchema = z
  .object({
    version: z.literal(1),
    assets: z.record(mediaFileSchema, mappedAssetSchema),
  })
  .strict()
  .superRefine(({ assets }, context) => {
    for (const [file, asset] of Object.entries(assets)) {
      if (file !== `${asset.sha256}.webp`) {
        context.addIssue({
          code: "custom",
          message: `${file}: mapping key does not match SHA-256`,
        });
      }
    }
  });

const publicationAssetSchema = z
  .object({
    file: mediaFileSchema,
    sha256: hashSchema,
    size: z.number().int().positive(),
    url: z.url(),
  })
  .strict();

export const githubPublicationSchema = z
  .object({
    version: z.literal(1),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    revision: hashSchema,
    generatedAt: z.iso.datetime(),
    media: z.array(
      z
        .object({
          tag: mediaTagSchema,
          assets: z.array(publicationAssetSchema).min(1).max(maximumAssetsPerMediaRelease),
        })
        .strict()
    ),
    mapping: githubMediaMapSchema,
  })
  .strict();

interface MediaAsset {
  file: string;
  sha256: string;
  size: number;
}

function releaseUrl(repository: string, tag: string, file: string) {
  return `https://github.com/${repository}/releases/download/${tag}/${file}`;
}

function nextMediaRelease(mapping: z.infer<typeof githubMediaMapSchema>) {
  const tags = new Set(Object.values(mapping.assets).map(({ tag }) => tag));
  let next = 1 + [...tags].filter((tag) => /^media-[a-f0-9]{64}$/.test(tag)).length;

  for (const tag of tags) {
    const sequence = /^media-([0-9]{4,})$/.exec(tag)?.[1];
    if (sequence) next = Math.max(next, Number(sequence) + 1);
  }

  return next;
}

export function createGitHubPublication(
  repository: string,
  snapshot: z.infer<typeof catalogSnapshotSchema>,
  assets: MediaAsset[],
  previousMap: unknown = { version: 1, assets: {} }
) {
  const mapping = githubMediaMapSchema.parse(previousMap);
  const nextAssets = { ...mapping.assets };
  const unpublished: MediaAsset[] = [];
  const seen = new Set<string>();
  let releaseNumber = nextMediaRelease(mapping);

  for (const asset of [...assets].sort((left, right) => left.file.localeCompare(right.file))) {
    mediaFileSchema.parse(asset.file);
    hashSchema.parse(asset.sha256);
    if (asset.file !== `${asset.sha256}.webp`) {
      throw new Error(`${asset.file}: filename does not match its SHA-256`);
    }
    if (seen.has(asset.file)) throw new Error(`${asset.file}: duplicate media asset`);
    seen.add(asset.file);
    const previous = nextAssets[asset.file];
    if (previous) {
      if (previous.sha256 !== asset.sha256 || previous.size !== asset.size) {
        throw new Error(`${asset.file}: published media mapping conflicts with local bytes`);
      }
    } else {
      unpublished.push(asset);
    }
  }

  const media = [];
  for (let offset = 0; offset < unpublished.length; offset += maximumAssetsPerMediaRelease) {
    const batch = unpublished.slice(offset, offset + maximumAssetsPerMediaRelease);
    const tag = `media-${String(releaseNumber++).padStart(4, "0")}`;
    media.push({
      tag,
      assets: batch.map((asset) => ({
        ...asset,
        url: releaseUrl(repository, tag, asset.file),
      })),
    });
    for (const asset of batch) {
      nextAssets[asset.file] = { tag, sha256: asset.sha256, size: asset.size };
    }
  }

  return githubPublicationSchema.parse({
    version: 1,
    repository,
    revision: snapshot.revision,
    generatedAt: snapshot.generatedAt,
    media,
    mapping: { version: 1, assets: nextAssets },
  });
}

async function optionalJson(path: URL, fallback: unknown) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readGitHubPublication(
  repository: string,
  directory = new URL("../.generated/", import.meta.url)
) {
  const snapshot = catalogSnapshotSchema.parse(
    JSON.parse(await readFile(new URL("snapshot.json", directory), "utf8"))
  );
  const mediaDirectory = new URL("media/", directory);
  let mediaFiles: string[];
  try {
    mediaFiles = await readdir(mediaDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    mediaFiles = [];
  }
  const assets = await Promise.all(
    mediaFiles.map(async (file) => {
      mediaFileSchema.parse(file);
      const data = await readFile(new URL(file, mediaDirectory));
      return {
        file,
        sha256: createHash("sha256").update(data).digest("hex"),
        size: data.byteLength,
      };
    })
  );
  const mapping = await optionalJson(new URL("media-map.json", directory), {
    version: 1,
    assets: {},
  });

  return createGitHubPublication(repository, snapshot, assets, mapping);
}
