import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { githubPublicationSchema } from "#catalog/github-publication";
import { writeJsonAtomic } from "#scripts/files";

const releaseSchema = z.object({
  id: z.number().int().positive(),
  upload_url: z.string(),
  draft: z.boolean(),
});
const releaseAssetSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  digest: z.string().nullable().optional(),
});
const immutableReleasesSchema = z.object({ enabled: z.literal(true) });

interface GitHubClientOptions {
  apiUrl: string;
  repository: string;
  token: string;
}

function headers(token: string, contentType = "application/vnd.github+json") {
  return new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
    "X-GitHub-Api-Version": "2026-03-10",
  });
}

async function github(
  options: GitHubClientOptions,
  path: string,
  init: RequestInit = {},
  missing = false
) {
  const requestHeaders = headers(options.token);

  for (const [name, value] of new Headers(init.headers)) requestHeaders.set(name, value);

  const response = await fetch(`${options.apiUrl}${path}`, {
    ...init,
    headers: requestHeaders,
  });

  if (missing && response.status === 404) return;
  if (!response.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path}: ${response.status}`);
  }

  if (response.status === 204) return;

  return (await response.json()) as unknown;
}

async function release(options: GitHubClientOptions, tag: string) {
  const encodedTag = encodeURIComponent(tag);
  const existing = await github(
    options,
    `/repos/${options.repository}/releases/tags/${encodedTag}`,
    {},
    true
  );

  if (existing) return releaseSchema.parse(existing);

  return releaseSchema.parse(
    await github(options, `/repos/${options.repository}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body: "AppHub content-addressed media. This release is immutable after publication.",
        draft: true,
        prerelease: true,
      }),
    })
  );
}

async function releaseAssets(options: GitHubClientOptions, releaseId: number) {
  const assets: Array<z.infer<typeof releaseAssetSchema>> = [];

  for (let page = 1; ; page++) {
    const batch = z
      .array(releaseAssetSchema)
      .parse(
        await github(
          options,
          `/repos/${options.repository}/releases/${releaseId}/assets?per_page=100&page=${page}`
        )
      );
    assets.push(...batch);

    if (batch.length < 100) return assets;
  }
}

export function missingMediaAssets<T extends { file: string; size: number; sha256: string }>(
  planned: T[],
  existing: Array<{ name: string; size: number; digest?: string | null | undefined }>
) {
  const byName = new Map(existing.map((asset) => [asset.name, asset]));

  return planned.filter((asset) => {
    const current = byName.get(asset.file);

    if (!current) return true;
    if (current.size !== asset.size) {
      throw new Error(`${asset.file}: existing release asset has a different size`);
    }
    if (current.digest !== `sha256:${asset.sha256}`) {
      throw new Error(`${asset.file}: existing release asset has no matching SHA-256 digest`);
    }

    return false;
  });
}

export async function publishGitHubMedia(
  publicationValue: unknown,
  mediaDirectory: URL,
  options: GitHubClientOptions,
  mapPath = new URL("../../.generated/media-map.json", import.meta.url)
) {
  const publication = githubPublicationSchema.parse(publicationValue);

  if (publication.repository !== options.repository) {
    throw new Error("publication repository does not match upload repository");
  }
  const immutable = await github(
    options,
    `/repos/${options.repository}/immutable-releases`,
    {},
    true
  );
  if (!immutable) throw new Error("GitHub immutable releases must be enabled before publication");
  immutableReleasesSchema.parse(immutable);

  let uploaded = 0;

  for (const bucket of publication.media) {
    const target = await release(options, bucket.tag);
    const existing = await releaseAssets(options, target.id);
    const plannedNames = new Set(bucket.assets.map(({ file }) => file));
    const unexpected = existing.find(({ name }) => !plannedNames.has(name));
    if (unexpected) throw new Error(`${bucket.tag}: unexpected release asset ${unexpected.name}`);
    const missing = missingMediaAssets(bucket.assets, existing);
    const uploadUrl = target.upload_url.replace("{?name,label}", "");

    for (const asset of missing) {
      const data = await readFile(new URL(asset.file, mediaDirectory));

      if (
        data.byteLength !== asset.size ||
        createHash("sha256").update(data).digest("hex") !== asset.sha256
      ) {
        throw new Error(`${asset.file}: local media changed after planning`);
      }

      const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(asset.file)}`, {
        method: "POST",
        headers: headers(options.token, "image/webp"),
        body: data,
      });

      if (!response.ok) {
        throw new Error(`GitHub upload ${bucket.tag}/${asset.file}: ${response.status}`);
      }

      uploaded++;
    }

    const completed = await releaseAssets(options, target.id);
    if (
      completed.length !== bucket.assets.length ||
      missingMediaAssets(bucket.assets, completed).length
    ) {
      throw new Error(`${bucket.tag}: release is incomplete or contains unexpected assets`);
    }
    if (target.draft) {
      await github(options, `/repos/${options.repository}/releases/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ draft: false, prerelease: true }),
      });
    }
  }

  await writeJsonAtomic(mapPath, publication.mapping);

  return uploaded;
}

async function main() {
  const planPath = process.env.APPHUB_PUBLICATION_PLAN;
  const token = process.env.GITHUB_TOKEN;

  if (!planPath) throw new Error("APPHUB_PUBLICATION_PLAN is required");
  if (!token) throw new Error("GITHUB_TOKEN is required");

  const publication = githubPublicationSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
  const uploaded = await publishGitHubMedia(
    publication,
    new URL("../../.generated/media/", import.meta.url),
    {
      apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
      repository: publication.repository,
      token,
    }
  );

  console.log(`Uploaded ${uploaded} new media assets.`);
}

if (import.meta.main) await main();
