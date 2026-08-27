import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { maximumAppMediaBytes, validateImage } from "#catalog/media";
import {
  appManifestSchema,
  appSchema,
  appstreamMetadataSchema,
  catalogProvenanceSchema,
  generatedMediaSchema,
  releaseLockSchema,
  type App,
  type AppManifest,
  type ReleaseLock,
} from "#catalog/schema";

interface AppEntry {
  slug: string;
  directory: URL;
  iconFile: string;
  app: App;
  lock: ReleaseLock;
  hasLock: boolean;
}

interface CatalogIdentity {
  id: string;
}

const appsDirectory = pathToFileURL(`${process.cwd()}/apps/`);
const generatedAppsDirectory = pathToFileURL(`${process.cwd()}/.generated/apps/`);

const manifestSizeLimit = 64 * 1024;
const releaseLockSizeLimit = 1024 * 1024;
const mediaSizeLimit = maximumAppMediaBytes;

const generatedFiles = new Set([
  "appstream.json",
  "media.json",
  "provenance.json",
  "releases.json",
]);
const mediaFile = /^[a-f0-9]{64}\.webp$/;

async function readBoundedFile(url: URL, sizeLimit: number) {
  const metadata = await lstat(url);

  if (!metadata.isFile()) {
    throw new Error(`${url.pathname}: must be a regular file`);
  }

  if (metadata.size > sizeLimit) {
    throw new Error(`${url.pathname}: file is too large`);
  }

  return readFile(url);
}

async function readJson(url: URL, sizeLimit: number) {
  return JSON.parse((await readBoundedFile(url, sizeLimit)).toString("utf8")) as unknown;
}

async function readOptionalLock(url: URL, appId: string) {
  try {
    return {
      lock: releaseLockSchema.parse(await readJson(url, releaseLockSizeLimit)),
      exists: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lock: { appId, releases: [] }, exists: false };
    }

    throw error;
  }
}

export function validateCatalogIdentities(apps: CatalogIdentity[]) {
  const ids = new Set<string>();

  for (const app of apps) {
    if (ids.has(app.id)) throw new Error(`Duplicate application id: ${app.id}`);

    ids.add(app.id);
  }
}

export async function readAppManifests(directory = appsDirectory) {
  const contents = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const manifests = new Map<string, AppManifest>();

  for (const entry of contents) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(entry.name);

    if (!entry.isFile() || !match) {
      throw new Error(`Unexpected catalog entry: ${entry.name}`);
    }

    const slug = match[1]!;
    const manifest = appManifestSchema.parse(
      await readJson(new URL(entry.name, directory), manifestSizeLimit)
    );

    manifests.set(slug, manifest);
  }

  validateCatalogIdentities(
    [...manifests.values()].map((manifest) => ({
      id:
        manifest.appstream.type === "manual"
          ? manifest.appstream.metadata.id
          : manifest.appstream.id,
    }))
  );

  return manifests;
}

export async function readApps(
  directory = appsDirectory,
  generatedDirectory = generatedAppsDirectory,
  selectedSlugs?: ReadonlySet<string>
) {
  const manifests = await readAppManifests(directory);
  const slugs = [...manifests.keys()].filter((slug) => !selectedSlugs || selectedSlugs.has(slug));
  const entries: AppEntry[] = [];
  const generatedMediaDirectory = new URL("../media/", generatedDirectory);
  const mediaNames = new Set(await readdir(generatedMediaDirectory));
  const referencedMedia = new Set<string>();
  const mediaContents = new Map<string, Buffer>();

  for (const name of mediaNames) {
    if (!mediaFile.test(name)) throw new Error(`Unexpected generated media file: ${name}`);
  }

  async function readMedia(name: string) {
    if (!mediaNames.has(name)) throw new Error(`Missing generated media file: ${name}`);

    referencedMedia.add(name);

    let data = mediaContents.get(name);

    if (!data) {
      data = await readBoundedFile(new URL(name, generatedMediaDirectory), mediaSizeLimit);
      const expected = name.slice(0, -".webp".length);
      const actual = createHash("sha256").update(data).digest("hex");

      if (actual !== expected) throw new Error(`${name}: content hash does not match filename`);

      mediaContents.set(name, data);
    }

    return data;
  }

  for (const slug of slugs) {
    const generatedAppDirectory = new URL(`${slug}/`, generatedDirectory);
    const names = await readdir(generatedAppDirectory);

    for (const name of names) {
      if (!generatedFiles.has(name)) {
        throw new Error(`${slug}: unexpected generated file ${name}`);
      }
    }

    const manifest = manifests.get(slug)!;
    const metadata = appstreamMetadataSchema.parse(
      await readJson(new URL("appstream.json", generatedAppDirectory), manifestSizeLimit)
    );
    const media = generatedMediaSchema.parse(
      await readJson(new URL("media.json", generatedAppDirectory), manifestSizeLimit)
    );
    const provenance = catalogProvenanceSchema.parse(
      await readJson(new URL("provenance.json", generatedAppDirectory), manifestSizeLimit)
    );

    const expectedId =
      manifest.appstream.type === "manual" ? manifest.appstream.metadata.id : manifest.appstream.id;

    if (metadata.id !== expectedId) {
      throw new Error(`${slug}: AppStream metadata has the wrong application id`);
    }

    const { appstream: _appstream, ...maintained } = manifest;
    const screenshots = media.screenshots.map(
      ({ validator: _validator, ...screenshot }) => screenshot
    );
    const app = appSchema.parse({
      ...metadata,
      ...maintained,
      provenance,
      icon: { source: media.icon.source },
      screenshots,
    });
    const appIconFile = media.icon.file;
    const appMedia = new Set([appIconFile, ...app.screenshots.map(({ file }) => file)]);
    let appMediaBytes = 0;

    for (const file of appMedia) appMediaBytes += (await readMedia(file)).length;

    if (appMediaBytes > maximumAppMediaBytes) {
      throw new Error(`${slug}: published media exceeds 1 MiB`);
    }

    await validateImage(await readMedia(appIconFile), appIconFile, app.id, { icon: true });

    for (const screenshot of app.screenshots) {
      await validateImage(await readMedia(screenshot.file), screenshot.file, app.id);
    }

    const { lock, exists } = await readOptionalLock(
      new URL("releases.json", generatedAppDirectory),
      app.id
    );

    if (lock.appId !== app.id) {
      throw new Error(`${slug}: release lock has the wrong application id`);
    }

    entries.push({
      slug,
      directory: generatedAppDirectory,
      iconFile: appIconFile,
      app,
      lock,
      hasLock: exists,
    });
  }

  if (!selectedSlugs) {
    for (const name of mediaNames) {
      if (!referencedMedia.has(name)) throw new Error(`Unreferenced generated media file: ${name}`);
    }
  }

  return entries;
}
