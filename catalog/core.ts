import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  appSchema,
  releaseLockSchema,
  type App,
  type Architecture,
  type ReleaseLock,
} from "@catalog/schema";

export type { Artifact, ReleaseLock } from "@catalog/schema";

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
  size: number;
}

interface SelectedAsset<T extends SelectableAsset> {
  architecture: Architecture;
  asset: T;
}

export const root = pathToFileURL(`${process.cwd()}/`);
const appsDirectory = new URL("apps/", root);
const allowedFiles = new Set(["app.json", "releases.json"]);
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

async function readJson(url: URL) {
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

async function readOptionalLock(url: URL, appId: string) {
  try {
    return { lock: releaseLockSchema.parse(await readJson(url)), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lock: { appId, releases: [] }, exists: false };
    }

    throw error;
  }
}

export async function readApps(directory = appsDirectory) {
  let contents;

  try {
    contents = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];

    throw error;
  }

  const directories = contents
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const entries: AppEntry[] = [];

  for (const slug of directories) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${slug}: invalid slug`);

    const appDirectory = new URL(`${slug}/`, directory);
    const names = await readdir(appDirectory);

    for (const name of names) {
      if (!allowedFiles.has(name) && !iconFile.test(name) && !screenshotFile.test(name))
        throw new Error(`${slug}: unexpected file ${name}`);
    }

    const app = appSchema.parse(await readJson(new URL("app.json", appDirectory)));
    const icons = names.filter((name) => iconFile.test(name));

    if (icons.length !== 1) throw new Error(`${slug}: expected one icon, found ${icons.length}`);

    const appIconFile = icons[0]!;

    await validateImage(await readFile(new URL(appIconFile, appDirectory)), appIconFile, app.id, {
      icon: true,
    });

    for (const screenshot of app.screenshots) {
      if (!names.includes(screenshot.file))
        throw new Error(`${slug}: missing screenshot ${screenshot.file}`);

      await validateImage(
        await readFile(new URL(screenshot.file, appDirectory)),
        screenshot.file,
        app.id
      );
    }

    const referencedScreenshots = new Set(app.screenshots.map(({ file }) => file));

    for (const name of names) {
      if (screenshotFile.test(name) && !referencedScreenshots.has(name))
        throw new Error(`${slug}: unreferenced screenshot ${name}`);
    }
    const { lock, exists } = await readOptionalLock(
      new URL("releases.json", appDirectory),
      app.id
    );

    if (lock.appId !== app.id)
      throw new Error(`${slug}: release lock has the wrong application id`);

    entries.push({
      slug,
      directory: appDirectory,
      iconFile: appIconFile,
      app,
      lock,
      hasLock: exists,
    });
  }

  const ids = new Set<string>();

  for (const { app } of entries) {
    if (ids.has(app.id)) throw new Error(`Duplicate application id: ${app.id}`);
    ids.add(app.id);
  }

  return entries;
}

export function globRegex(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
}

export function matchesArchitecture(name: string, architecture: Architecture) {
  if (!name.toLowerCase().endsWith(".appimage")) return false;

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

    if (!pattern && matches.length === 0) continue;
    if (!asset || matches.length !== 1)
      throw new Error(`${app.id}: expected one ${architecture} asset, found ${matches.length}`);

    selected.push({ architecture, asset });
  }

  if (selected.length === 0) throw new Error(`${app.id}: no AppImage assets found`);
  if (new Set(selected.map(({ asset }) => asset.name)).size !== selected.length)
    throw new Error(`${app.id}: architecture rules selected the same asset`);

  return selected;
}

export function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export async function hashDownload(file: Download) {
  const response = await fetch(file.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok || !response.body)
    throw new Error(`${file.name}: download returned ${response.status}`);

  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;
    size += value.byteLength;
    if (size > file.size) throw new Error(`${file.name}: download exceeds published size`);
    hash.update(value);
  }

  if (size !== file.size) throw new Error(`${file.name}: download differs from published size`);

  return { size, sha256: hash.digest("hex") };
}

type ImageType = "image/avif" | "image/jpeg" | "image/png" | "image/webp";

export function imageType(file: string): ImageType {
  const extension = file.toLowerCase().split(".").at(-1);

  if (extension === "avif") return "image/avif";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";

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

    if (metadata.mediaType !== expectedType)
      throw new Error(`${file} does not match its image format`);
    if ((metadata.pages ?? 1) !== 1) throw new Error(`${file} must not be animated`);
    if (!metadata.width || !metadata.height) throw new Error(`${file} has no dimensions`);

    await image.stats();

    if (
      options.icon &&
      (metadata.width !== metadata.height || metadata.width < 128 || metadata.width > 1024)
    )
      throw new Error("icon must be square and between 128 and 1024 pixels");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`${appId}: ${message}`);
  }
}
