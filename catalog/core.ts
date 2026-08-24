import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { safeFetch } from "#catalog/http";
import {
  appManifestSchema,
  appSchema,
  appstreamMetadataSchema,
  generatedMediaSchema,
  releaseLockSchema,
  type App,
  type Architecture,
  type ReleaseLock,
} from "#catalog/schema";

export type { Artifact, ReleaseLock } from "#catalog/schema";

interface AppEntry {
  slug: string;
  directory: URL;
  iconFile: string;
  app: App;
  lock: ReleaseLock;
  hasLock: boolean;
}

interface SelectableAsset {
  name: string;
}

interface Download {
  name: string;
  url: string;
  size?: number;
}

interface SelectedAsset<T extends SelectableAsset> {
  architecture: Architecture;
  asset: T;
}

export const root = pathToFileURL(`${process.cwd()}/`);

const appsDirectory = new URL("apps/", root);
const generatedAppsDirectory = new URL(".generated/apps/", root);

const manifestSizeLimit = 64 * 1024;
const releaseLockSizeLimit = 1024 * 1024;
const iconSizeLimit = 2 * 1024 * 1024;
const screenshotSizeLimit = 10 * 1024 * 1024;

const generatedFiles = new Set(["appstream.json", "media.json", "releases.json"]);
const imageExtension = "(?:png|jpe?g|webp|avif)";
const iconFile = new RegExp(`^icon\\.${imageExtension}$`, "i");
const screenshotFile = new RegExp(`^screenshot-[1-9][0-9]*\\.${imageExtension}$`, "i");

const architectureMatchers: Array<[Architecture, RegExp]> = [
  ["x86_64", /(?:^|[^a-z0-9])(?:x86[_-]?64|amd64)(?:[^a-z0-9]|$)/i],
  ["i686", /(?:^|[^a-z0-9])(?:i[3-6]86|x86[_-]?32)(?:[^a-z0-9]|$)/i],
  ["aarch64", /(?:^|[^a-z0-9])(?:aarch64|arm64)(?:[^a-z0-9]|$)/i],
  ["armv7l", /(?:^|[^a-z0-9])(?:armv7l?|armhf)(?:[^a-z0-9]|$)/i],
  ["riscv64", /(?:^|[^a-z0-9])riscv64(?:[^a-z0-9]|$)/i],
  ["ppc64le", /(?:^|[^a-z0-9])ppc64le(?:[^a-z0-9]|$)/i],
  ["s390x", /(?:^|[^a-z0-9])s390x(?:[^a-z0-9]|$)/i],
];

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

export async function readApps(
  directory = appsDirectory,
  generatedDirectory = generatedAppsDirectory,
  selectedSlugs?: ReadonlySet<string>
) {
  let contents;

  try {
    contents = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const directories = contents
    .filter((entry) => entry.isDirectory() && (!selectedSlugs || selectedSlugs.has(entry.name)))
    .map((entry) => entry.name)
    .sort();
  const entries: AppEntry[] = [];

  for (const slug of directories) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`${slug}: invalid slug`);
    }

    const appDirectory = new URL(`${slug}/`, directory);
    const sourceNames = await readdir(appDirectory);

    for (const name of sourceNames) {
      if (name !== "app.json") {
        throw new Error(`${slug}: unexpected file ${name}`);
      }
    }

    const generatedAppDirectory = new URL(`${slug}/`, generatedDirectory);
    const names = await readdir(generatedAppDirectory);

    for (const name of names) {
      if (!generatedFiles.has(name) && !iconFile.test(name) && !screenshotFile.test(name)) {
        throw new Error(`${slug}: unexpected generated file ${name}`);
      }
    }

    const manifest = appManifestSchema.parse(
      await readJson(new URL("app.json", appDirectory), manifestSizeLimit)
    );
    const metadata = appstreamMetadataSchema.parse(
      await readJson(new URL("appstream.json", generatedAppDirectory), manifestSizeLimit)
    );
    const media = generatedMediaSchema.parse(
      await readJson(new URL("media.json", generatedAppDirectory), manifestSizeLimit)
    );

    const expectedId =
      manifest.appstream.type === "manual" ? manifest.appstream.metadata.id : manifest.appstream.id;

    if (metadata.id !== expectedId) {
      throw new Error(`${slug}: AppStream metadata has the wrong application id`);
    }

    const { appstream: _appstream, ...maintained } = manifest;
    const app = appSchema.parse({
      ...metadata,
      ...maintained,
      icon: { source: media.icon.source },
      screenshots: media.screenshots,
    });
    const icons = names.filter((name) => iconFile.test(name));

    if (icons.length !== 1 || icons[0] !== media.icon.file) {
      throw new Error(`${slug}: expected one icon, found ${icons.length}`);
    }

    const appIconFile = media.icon.file;

    await validateImage(
      await readBoundedFile(new URL(appIconFile, generatedAppDirectory), iconSizeLimit),
      appIconFile,
      app.id,
      { icon: true }
    );

    for (const screenshot of app.screenshots) {
      if (!names.includes(screenshot.file)) {
        throw new Error(`${slug}: missing screenshot ${screenshot.file}`);
      }

      await validateImage(
        await readBoundedFile(new URL(screenshot.file, generatedAppDirectory), screenshotSizeLimit),
        screenshot.file,
        app.id
      );
    }

    const referencedScreenshots = new Set(app.screenshots.map(({ file }) => file));

    for (const name of names) {
      if (screenshotFile.test(name) && !referencedScreenshots.has(name)) {
        throw new Error(`${slug}: unreferenced screenshot ${name}`);
      }
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

  const ids = new Set<string>();

  for (const { app } of entries) {
    if (ids.has(app.id)) {
      throw new Error(`Duplicate application id: ${app.id}`);
    }

    ids.add(app.id);
  }

  for (const { app } of entries) {
    if (app.replacedBy === app.id) {
      throw new Error(`${app.id}: replacement refers to itself`);
    }

    if (app.replacedBy && !ids.has(app.replacedBy)) {
      throw new Error(`${app.id}: replacement ${app.replacedBy} is not in the catalog`);
    }
  }

  return entries;
}

export function globRegex(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
}

export function matchesArchitecture(name: string, architecture: Architecture) {
  if (!name.toLowerCase().endsWith(".appimage")) {
    return false;
  }

  const expression = architectureMatchers.find(([name]) => name === architecture)?.[1];

  return expression?.test(name) ?? false;
}

export function selectAssets<T extends SelectableAsset>(app: App, assets: T[]) {
  const selected: Array<SelectedAsset<T>> = [];

  const rules: Array<[Architecture, string | undefined]> = app.assets
    ? Object.entries(app.assets).sort(([left], [right]) => left.localeCompare(right))
    : architectureMatchers.map(([architecture]) => [architecture, undefined]);

  for (const [architecture, pattern] of rules) {
    const matches = assets.filter((asset) =>
      pattern ? globRegex(pattern).test(asset.name) : matchesArchitecture(asset.name, architecture)
    );
    const asset = matches[0];

    if (!pattern && matches.length === 0) {
      continue;
    }

    if (!asset || matches.length !== 1) {
      throw new Error(`${app.id}: expected one ${architecture} asset, found ${matches.length}`);
    }

    selected.push({ architecture, asset });
  }

  if (selected.length === 0) {
    throw new Error(`${app.id}: no AppImage assets found`);
  }

  if (new Set(selected.map(({ asset }) => asset.name)).size !== selected.length) {
    throw new Error(`${app.id}: architecture rules selected the same asset`);
  }

  return selected;
}

export function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export async function hashDownload(
  file: Download,
  options: {
    maximumSize?: number;
    fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  } = {}
) {
  const { maximumSize = 2 * 1024 * 1024 * 1024, fetcher = fetch } = options;

  if (file.size !== undefined && file.size > maximumSize) {
    throw new Error(`${file.name}: published size exceeds download limit`);
  }

  const response = await safeFetch(file.url, { signal: AbortSignal.timeout(300_000) }, fetcher);

  if (!response.ok || !response.body) {
    throw new Error(`${file.name}: download returned ${response.status}`);
  }

  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  const sizeLimit = file.size ?? maximumSize;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > sizeLimit) {
      await reader.cancel();
      throw new Error(
        `${file.name}: download exceeds ${file.size === undefined ? "size limit" : "published size"}`
      );
    }

    hash.update(value);
  }

  if (file.size !== undefined && size !== file.size) {
    throw new Error(`${file.name}: download differs from published size`);
  }

  return { size, sha256: hash.digest("hex") };
}

type ImageType = "image/avif" | "image/jpeg" | "image/png" | "image/webp";

export function imageType(file: string): ImageType {
  const extension = file.toLowerCase().split(".").at(-1);

  if (extension === "avif") {
    return "image/avif";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  throw new Error(`${file}: unsupported image format`);
}

export async function validateImage(
  data: Buffer,
  file: string,
  appId: string,
  options: { icon?: boolean } = {}
) {
  try {
    const expectedType = imageType(file);

    const image = sharp(data, { animated: true, failOn: "error" });
    const metadata = await image.metadata();

    if (metadata.mediaType !== expectedType) {
      throw new Error(`${file} does not match its image format`);
    }

    if ((metadata.pages ?? 1) !== 1) {
      throw new Error(`${file} must not be animated`);
    }

    if (!metadata.width || !metadata.height) {
      throw new Error(`${file} has no dimensions`);
    }

    if (metadata.width > 8192 || metadata.height > 8192) {
      throw new Error(`${file} dimensions must not exceed 8192 pixels`);
    }

    if (metadata.width * metadata.height > 33_177_600) {
      throw new Error(`${file} must not exceed 33 megapixels`);
    }

    await image.stats();

    if (
      options.icon &&
      (metadata.width !== metadata.height || metadata.width < 128 || metadata.width > 1024)
    ) {
      throw new Error("icon must be square and between 128 and 1024 pixels");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`${appId}: ${message}`, { cause: error });
  }
}
