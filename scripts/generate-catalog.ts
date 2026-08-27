import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import { readAppManifests } from "#catalog/storage";
import {
  appstreamMetadataSchema,
  catalogProvenanceSchema,
  generatedMediaSchema,
  releaseLockSchema,
  type AppManifest,
} from "#catalog/schema";
import { conditionalHeaders, readResponse, responseValidator, safeFetch } from "#catalog/http";
import {
  classifyRefreshError,
  isRefreshDue,
  refreshEveryHours,
  refreshFailed,
  refreshSucceeded,
  retryRefresh,
} from "#catalog/refresh";
import type { HttpValidator } from "#catalog/refresh";
import { printRefreshNetworkSummary } from "#catalog/network";
import { maximumAppMediaBytes, maximumScreenshots, normalizeImage } from "#catalog/media";
import { readAppstreamSource } from "#scripts/appstream-source";
import { forEachConcurrent } from "#scripts/concurrency";
import { generateReleases } from "#scripts/update-releases";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

interface CachedImage {
  file: string;
  source: string;
  validator?: HttpValidator | undefined;
}

type CachedMedia = z.infer<typeof generatedMediaSchema>;
type CachedProvenance = z.infer<typeof catalogProvenanceSchema>;

async function downloadImage(
  url: string,
  outputDirectory: string,
  icon: boolean,
  cached?: CachedImage
) {
  const response = await safeFetch(url, {
    headers: conditionalHeaders(cached?.source === url ? cached.validator : undefined),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 304) {
    if (!cached?.validator) {
      throw new Error(`Image returned 304 without a cached file: ${url}`);
    }

    const content = await readFile(`.generated/media/${cached.file}`);
    const file = `${createHash("sha256").update(content).digest("hex")}.webp`;

    await createFileIfMissing(`${outputDirectory}/${file}`, content);

    return { file, validator: cached.validator, size: content.length };
  }

  if (!response.ok) {
    throw new Error(`Image request failed with HTTP ${response.status}: ${url}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";

  if (!imageTypes.has(contentType)) {
    throw new Error(`Unsupported image type from ${url}`);
  }

  const source = await readResponse(response, 10 * 1024 * 1024, url);
  const content = await normalizeImage(source, icon);
  const file = `${createHash("sha256").update(content).digest("hex")}.webp`;

  await createFileIfMissing(`${outputDirectory}/${file}`, content);

  const validator = responseValidator(response);

  return {
    file,
    size: content.length,
    ...(validator ? { validator } : {}),
  };
}

async function createFileIfMissing(path: string, contents: string | Uint8Array) {
  try {
    await writeFile(path, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

function validateMediaSize(slug: string, files: Map<string, number>) {
  const size = [...files.values()].reduce((total, value) => total + value, 0);

  if (size > maximumAppMediaBytes) {
    throw new Error(`${slug}: normalized media exceeds 1 MiB`);
  }
}

async function stageCachedApp(
  slug: string,
  path: string,
  media: CachedMedia,
  outputDirectory: string
) {
  await cp(`.generated/apps/${slug}`, path, { recursive: true });

  const icon = await stageCachedImage(media.icon, outputDirectory);
  const screenshots = [];
  const files = new Map([[icon.file, icon.size]]);
  const screenshotFiles = new Set<string>();

  for (const screenshot of media.screenshots.slice(0, maximumScreenshots)) {
    const image = await stageCachedImage(screenshot, outputDirectory);

    if (screenshotFiles.has(image.file)) continue;

    screenshotFiles.add(image.file);
    files.set(image.file, image.size);
    screenshots.push({ ...screenshot, file: image.file });
  }

  validateMediaSize(slug, files);

  const { size: _size, ...storedIcon } = icon;

  await writeFile(
    `${path}/media.json`,
    `${JSON.stringify({ icon: storedIcon, screenshots }, null, 2)}\n`
  );
}

async function stageCachedImage(image: CachedImage, outputDirectory: string) {
  const content = await readFile(`.generated/media/${image.file}`);
  const file = `${createHash("sha256").update(content).digest("hex")}.webp`;

  await createFileIfMissing(`${outputDirectory}/${file}`, content);

  return { ...image, file, size: content.length };
}

async function pruneGeneratedMedia(appsPath: string, mediaPath: string) {
  const referenced = new Set<string>();

  for (const entry of await readdir(appsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const media = generatedMediaSchema.parse(
      JSON.parse(await readFile(`${appsPath}/${entry.name}/media.json`, "utf8"))
    );

    referenced.add(media.icon.file);
    for (const screenshot of media.screenshots) referenced.add(screenshot.file);
  }

  for (const file of await readdir(mediaPath)) {
    if (!referenced.has(file)) await rm(`${mediaPath}/${file}`);
  }
}

async function preserveReleaseLock(slug: string, appId: string, path: string) {
  const source = `.generated/apps/${slug}/releases.json`;
  let value: unknown;

  try {
    value = JSON.parse(await readFile(source, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;

    throw error;
  }

  const lock = releaseLockSchema.parse(value);

  if (lock.appId !== appId) {
    throw new Error(`${slug}: release lock belongs to ${lock.appId}, not ${appId}`);
  }

  await copyFile(source, `${path}/releases.json`);
}

async function readCachedApp(slug: string, manifest: AppManifest) {
  const directory = `.generated/apps/${slug}`;

  try {
    if (!(await lstat(directory)).isDirectory()) {
      throw new Error(`${directory}: must be a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;

    throw error;
  }

  const [metadata, media, provenance] = await Promise.all([
    readFile(`${directory}/appstream.json`, "utf8").then((value) =>
      appstreamMetadataSchema.parse(JSON.parse(value))
    ),
    readFile(`${directory}/media.json`, "utf8").then((value) =>
      generatedMediaSchema.parse(JSON.parse(value))
    ),
    readFile(`${directory}/provenance.json`, "utf8").then((value) =>
      catalogProvenanceSchema.parse(JSON.parse(value))
    ),
  ]);
  const appId =
    manifest.appstream.type === "manual" ? manifest.appstream.metadata.id : manifest.appstream.id;

  if (metadata.id !== appId) {
    throw new Error(`${slug}: generated data belongs to ${metadata.id}, not ${appId}`);
  }

  return { metadata, media, provenance };
}

function releaseSourceUrl(source: AppManifest["releaseSource"]) {
  if (source.type === "feed") return source.url;

  const host =
    source.type === "github"
      ? "github.com"
      : source.type === "gitlab"
        ? "gitlab.com"
        : "codeberg.org";

  return `https://${host}/${source.repository}`;
}

function configuredMetadataSource(source: AppManifest["appstream"]) {
  if (source.type === "manual") {
    return { provider: "manifest", providerId: source.metadata.id };
  }

  if (source.type === "flathub") {
    return {
      provider: "flathub",
      providerId: source.id,
      sourceUrl: `https://flathub.org/api/v2/appstream/${encodeURIComponent(source.id)}`,
    };
  }

  return { provider: "url", providerId: source.id, sourceUrl: source.url };
}

function sourceConfigurationMatches(
  manifest: AppManifest,
  provenance: CachedProvenance | undefined
) {
  if (!provenance) return false;

  return (
    metadataSourceMatches(manifest, provenance) &&
    provenance.releaseSource.provider === manifest.releaseSource.type &&
    provenance.releaseSource.configuredUrl === releaseSourceUrl(manifest.releaseSource)
  );
}

function metadataSourceMatches(manifest: AppManifest, provenance: CachedProvenance | undefined) {
  if (!provenance) return false;

  const metadata = configuredMetadataSource(manifest.appstream);

  return (
    provenance.metadata.provider === metadata.provider &&
    provenance.metadata.providerId === metadata.providerId &&
    provenance.metadata.sourceUrl === metadata.sourceUrl
  );
}

interface GenerateCatalogOptions {
  failSoft?: boolean;
  forceRefresh?: boolean;
  requestedSlugs?: string[];
}

export async function generateCatalog({
  failSoft = false,
  forceRefresh = false,
  requestedSlugs = [],
}: GenerateCatalogOptions = {}) {
  const manifests = await readAppManifests();
  const slugs = [...manifests.keys()];
  const requested = new Set(requestedSlugs);

  if (requested.size !== requestedSlugs.length) {
    throw new Error("Application slugs must be unique");
  }

  for (const slug of requested) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Invalid application slug: ${slug}`);
    }
  }

  const selected = requested.size ? slugs.filter((slug) => requested.has(slug)) : slugs;
  const generatedPath = `.generated/catalog.tmp-${process.pid}`;
  const generatedAppsPath = `${generatedPath}/apps`;
  const generatedMediaPath = `${generatedPath}/media`;
  const refreshTime = new Date();

  await mkdir(".generated", { recursive: true });
  await createFileIfMissing(
    ".generated/downloads.json",
    '{\n  "snapshots": [],\n  "refresh": {}\n}\n'
  );
  await createFileIfMissing(".generated/star-etags.json", "{}\n");
  await createFileIfMissing(".generated/stars.json", '{\n  "values": {},\n  "refresh": {}\n}\n');
  await rm(generatedPath, { recursive: true, force: true });
  await mkdir(generatedAppsPath, { recursive: true });
  await mkdir(generatedMediaPath);

  try {
    await forEachConcurrent(selected, 4, async (slug) => {
      const path = `${generatedAppsPath}/${slug}`;
      const manifest = manifests.get(slug)!;
      const cachedApp = await readCachedApp(slug, manifest);
      const cachedProvenance = cachedApp?.provenance;
      const attemptAt = new Date().toISOString();

      if (
        failSoft &&
        !forceRefresh &&
        cachedApp &&
        sourceConfigurationMatches(manifest, cachedProvenance) &&
        !isRefreshDue(cachedProvenance?.refresh.metadata, refreshEveryHours.metadata, refreshTime)
      ) {
        await stageCachedApp(slug, path, cachedApp.media, generatedMediaPath);

        return;
      }

      try {
        await retryRefresh(async () => {
          await rm(path, { recursive: true, force: true });
          await mkdir(path);

          const {
            metadata,
            media,
            provenance: metadataSource,
          } = await readAppstreamSource(
            manifest.appstream,
            slug,
            metadataSourceMatches(manifest, cachedProvenance) && cachedApp
              ? {
                  ...cachedApp,
                  ...(cachedProvenance?.metadata.validator
                    ? { validator: cachedProvenance.metadata.validator }
                    : {}),
                }
              : undefined
          );

          if (!media.icon) {
            throw new Error(`${slug}: AppStream metadata has no usable icon`);
          }

          if (!media.screenshots.length || media.screenshots.some(({ source }) => !source)) {
            throw new Error(`${slug}: AppStream metadata has no usable screenshots`);
          }

          await writeFile(`${path}/appstream.json`, `${JSON.stringify(metadata, null, 2)}\n`);
          const icon = await downloadImage(
            media.icon,
            generatedMediaPath,
            true,
            cachedApp?.media.icon
          );
          const screenshots = [];
          const mediaFiles = new Map([[icon.file, icon.size]]);
          const screenshotFiles = new Set<string>();

          for (const screenshot of media.screenshots.slice(0, maximumScreenshots)) {
            const cachedScreenshot = cachedApp?.media.screenshots.find(
              ({ source }) => source === screenshot.source
            );
            const image = await downloadImage(
              screenshot.source!,
              generatedMediaPath,
              false,
              cachedScreenshot
            );

            if (screenshotFiles.has(image.file)) continue;

            screenshotFiles.add(image.file);
            mediaFiles.set(image.file, image.size);

            screenshots.push({
              file: image.file,
              caption: screenshot.caption,
              ...(screenshot.captionTranslations
                ? { captionTranslations: screenshot.captionTranslations }
                : {}),
              source: screenshot.source!,
              ...(image.validator ? { validator: image.validator } : {}),
            });
          }

          validateMediaSize(slug, mediaFiles);

          const { size: _iconSize, ...storedIcon } = icon;

          await writeFile(
            `${path}/media.json`,
            `${JSON.stringify({ icon: { ...storedIcon, source: media.icon }, screenshots }, null, 2)}\n`
          );

          const succeededAt = new Date().toISOString();
          const configuredUrl = releaseSourceUrl(manifest.releaseSource);
          const cachedReleaseSource = cachedProvenance?.releaseSource;
          const releaseSource =
            cachedReleaseSource?.provider === manifest.releaseSource.type &&
            cachedReleaseSource.configuredUrl === configuredUrl
              ? cachedReleaseSource
              : {
                  provider: manifest.releaseSource.type,
                  configuredUrl,
                  sourceUrl: configuredUrl,
                };
          const provenance = catalogProvenanceSchema.parse({
            metadata: metadataSource,
            releaseSource,
            refresh: {
              metadata: refreshSucceeded(succeededAt),
              releases: cachedProvenance?.refresh.releases ?? refreshSucceeded(succeededAt),
            },
          });

          await writeFile(`${path}/provenance.json`, `${JSON.stringify(provenance, null, 2)}\n`);
          await preserveReleaseLock(slug, metadata.id, path);
        });

        console.log(`${slug}: generated AppStream metadata and media`);
      } catch (error) {
        if (!failSoft || !cachedApp || !sourceConfigurationMatches(manifest, cachedProvenance)) {
          throw error;
        }

        await rm(path, { recursive: true, force: true });
        await stageCachedApp(slug, path, cachedApp.media, generatedMediaPath);

        const provenance = catalogProvenanceSchema.parse(
          JSON.parse(await readFile(`${path}/provenance.json`, "utf8"))
        );

        provenance.refresh.metadata = refreshFailed(
          provenance.refresh.metadata,
          attemptAt,
          classifyRefreshError(error)
        );

        await writeFile(`${path}/provenance.json`, `${JSON.stringify(provenance, null, 2)}\n`);
        console.warn(`${slug}: kept metadata after refresh failure: ${String(error)}`);
      }
    });

    await pruneGeneratedMedia(generatedAppsPath, generatedMediaPath);

    if (selected.length) {
      await generateReleases(pathToFileURL(`${process.cwd()}/${generatedAppsPath}/`), selected, {
        failSoft,
        forceRefresh,
      });
    }

    await mkdir(".generated/apps", { recursive: true });

    if (requested.size) {
      await mkdir(".generated/media", { recursive: true });

      for (const file of await readdir(generatedMediaPath)) {
        await copyFile(`${generatedMediaPath}/${file}`, `.generated/media/${file}`);
      }

      for (const slug of requested) {
        await rm(`.generated/apps/${slug}`, { recursive: true, force: true });

        if (selected.includes(slug)) {
          await rename(`${generatedAppsPath}/${slug}`, `.generated/apps/${slug}`);
        }
      }

      await pruneGeneratedMedia(".generated/apps", ".generated/media");
      await rm(generatedPath, { recursive: true, force: true });
    } else {
      await rm(".generated/apps", { recursive: true, force: true });
      await rm(".generated/media", { recursive: true, force: true });
      await rename(generatedAppsPath, ".generated/apps");
      await rename(generatedMediaPath, ".generated/media");
      await rm(generatedPath, { recursive: true, force: true });
    }
  } catch (error) {
    await rm(generatedPath, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.main) {
  try {
    await generateCatalog({ requestedSlugs: process.argv.slice(2) });
    await writeCatalogSnapshot();
  } finally {
    await printRefreshNetworkSummary();
  }
}
