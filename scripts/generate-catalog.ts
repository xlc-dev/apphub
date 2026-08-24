import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { appManifestSchema, releaseLockSchema } from "#catalog/schema";
import { readAppstreamXml, readFlathubAppstream, readFlathubAssets } from "#catalog/appstream";
import { readResponse, safeFetch } from "#catalog/http";
import { generateReleases } from "#scripts/update-releases";

const imageTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

async function downloadImage(url: string, basename: string) {
  const response = await safeFetch(url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok) {
    throw new Error(`Image request failed with HTTP ${response.status}: ${url}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  const extension = imageTypes.get(contentType);

  if (!extension) {
    throw new Error(`Unsupported image type from ${url}`);
  }

  const content = await readResponse(response, 10 * 1024 * 1024, url);

  const file = `${basename}.${extension}`;

  await writeFile(file, content);

  return file.split("/").at(-1)!;
}

async function readManifest(path: string) {
  const metadata = await lstat(path);

  if (!metadata.isFile()) {
    throw new Error(`${path}: must be a regular file`);
  }

  if (metadata.size > 64 * 1024) {
    throw new Error(`${path}: file is too large`);
  }

  return appManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function createFileIfMissing(path: string, contents: string) {
  try {
    await writeFile(path, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

async function preserveReleaseLock(slug: string, appId: string, path: string) {
  const source = `.generated/apps/${slug}/releases.json`;

  try {
    const lock = releaseLockSchema.parse(JSON.parse(await readFile(source, "utf8")));

    if (lock.appId === appId) {
      await copyFile(source, `${path}/releases.json`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

const directories = (await readdir("apps", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const requestedSlugs = process.argv.slice(2);
const requested = new Set(requestedSlugs);

if (requested.size !== requestedSlugs.length) {
  throw new Error("Application slugs must be unique");
}

for (const slug of requested) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid application slug: ${slug}`);
  }
}

const selected = requested.size
  ? directories.filter((directory) => requested.has(directory))
  : directories;

const generatedPath = `.generated/apps.tmp-${process.pid}`;

await mkdir(".generated", { recursive: true });
await createFileIfMissing(".generated/downloads.json", '{\n  "snapshots": []\n}\n');
await createFileIfMissing(".generated/star-etags.json", "{}\n");
await createFileIfMissing(".generated/stars.json", "{}\n");

await rm(generatedPath, { recursive: true, force: true });
await mkdir(generatedPath, { recursive: true });

try {
  for (const directory of selected) {
    const sourcePath = `apps/${directory}`;
    const names = await readdir(sourcePath);

    for (const name of names) {
      if (name !== "app.json") {
        throw new Error(`${directory}: unexpected source file ${name}`);
      }
    }

    const path = `${generatedPath}/${directory}`;

    await mkdir(path);

    const manifest = await readManifest(`${sourcePath}/app.json`);
    const { appstream } = manifest;
    let metadata;
    let media;

    if (appstream.type === "manual") {
      metadata = appstream.metadata;
      media = appstream.media;
    } else {
      const response = await safeFetch(
        appstream.type === "flathub"
          ? `https://flathub.org/api/v2/appstream/${appstream.id}`
          : appstream.url,
        { signal: AbortSignal.timeout(30_000) }
      );

      if (!response.ok) {
        throw new Error(`${directory}: AppStream request failed with HTTP ${response.status}`);
      }

      if (appstream.type === "flathub") {
        const source: unknown = JSON.parse(
          (await readResponse(response, 2 * 1024 * 1024, appstream.id)).toString("utf8")
        );

        metadata = readFlathubAppstream(source);
        media = readFlathubAssets(source);
      } else {
        const xml = await readResponse(response, 2 * 1024 * 1024, appstream.url);

        metadata = readAppstreamXml(xml.toString("utf8"), appstream.id);
        media = appstream.media;
      }

      if (metadata.id !== appstream.id) {
        throw new Error(`${directory}: AppStream response has the wrong application id`);
      }
    }

    if (!media.screenshots.length || media.screenshots.some(({ source }) => !source)) {
      throw new Error(`${directory}: AppStream metadata has no usable screenshots`);
    }

    await writeFile(`${path}/appstream.json`, `${JSON.stringify(metadata, null, 2)}\n`);
    const icon = await downloadImage(media.icon, `${path}/icon`);
    const screenshots = [];

    for (const [index, screenshot] of media.screenshots.entries()) {
      const file = await downloadImage(screenshot.source!, `${path}/screenshot-${index + 1}`);

      screenshots.push({ file, caption: screenshot.caption, source: screenshot.source! });
    }

    await writeFile(
      `${path}/media.json`,
      `${JSON.stringify({ icon: { file: icon, source: media.icon }, screenshots }, null, 2)}\n`
    );

    await preserveReleaseLock(directory, metadata.id, path);

    console.log(`${directory}: generated AppStream metadata and media`);
  }

  if (selected.length) {
    await generateReleases(pathToFileURL(`${process.cwd()}/${generatedPath}/`), selected);
  }

  await mkdir(".generated/apps", { recursive: true });

  if (requested.size) {
    for (const slug of requested) {
      await rm(`.generated/apps/${slug}`, { recursive: true, force: true });

      if (selected.includes(slug)) {
        await rename(`${generatedPath}/${slug}`, `.generated/apps/${slug}`);
      }
    }

    await rm(generatedPath, { recursive: true, force: true });
  } else {
    await rm(".generated/apps", { recursive: true, force: true });
    await rename(generatedPath, ".generated/apps");
  }
} catch (error) {
  await rm(generatedPath, { recursive: true, force: true });
  throw error;
}
