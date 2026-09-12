import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const appCount = 4000;
const artifactCount = 8000;
const maximumBuildMilliseconds = 8 * 60 * 1000;
const maximumSiteBytes = 500 * 1024 * 1024;
const project = new URL("../", import.meta.url).pathname;
const fixture = await mkdtemp(join(project, ".scale-fixture-"));

async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function directorySize(path: string): Promise<number> {
  let size = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    size += entry.isDirectory() ? await directorySize(child) : (await stat(child)).size;
  }
  return size;
}

async function run(command: string, arguments_: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: fixture,
      env: {
        ...process.env,
        APPHUB_ASSET_REPOSITORY: "example/apphub",
        BASE_PATH: "/apphub",
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}`))
    );
  });
}

try {
  for (const entry of await readdir(project)) {
    if (
      entry.startsWith(".scale-fixture-") ||
      [".astro", ".generated", ".git", "dist", "node_modules"].includes(entry)
    ) {
      continue;
    }
    await cp(join(project, entry), join(fixture, entry), { recursive: true });
  }
  await symlink(join(project, "node_modules"), join(fixture, "node_modules"));
  await rm(join(fixture, "apps"), { recursive: true, force: true });
  await rm(join(fixture, "trust"), { recursive: true, force: true });
  await mkdir(join(fixture, "apps"));
  await mkdir(join(fixture, ".generated/apps"), { recursive: true });
  await mkdir(join(fixture, ".generated/media"), { recursive: true });

  const templateSlug = (await readdir(join(project, ".generated/apps"))).sort()[0]!;
  const templateDirectory = join(project, ".generated/apps", templateSlug);
  const metadata = await json(join(templateDirectory, "appstream.json"));
  const media = await json(join(templateDirectory, "media.json"));
  const provenance = await json(join(templateDirectory, "provenance.json"));
  const releaseLock = await json(join(templateDirectory, "releases.json"));
  const templateManifest = await json(join(project, "apps", `${templateSlug}.json`));
  const screenshots = (media.screenshots as Array<Record<string, unknown>>).slice(0, 1);
  const mediaFiles = [
    String((media.icon as Record<string, unknown>).file),
    ...screenshots.map(({ file }) => String(file)),
  ];
  for (const file of mediaFiles) {
    await cp(join(project, ".generated/media", file), join(fixture, ".generated/media", file));
  }
  const mappedMedia: Record<string, { tag: string; sha256: string; size: number }> = {};
  for (const file of mediaFiles) {
    mappedMedia[file] = {
      tag: `media-${"f".repeat(64)}`,
      sha256: file.replace(/\.webp$/, ""),
      size: (await stat(join(fixture, ".generated/media", file))).size,
    };
  }
  await writeJson(join(fixture, ".generated/media-map.json"), {
    version: 1,
    assets: mappedMedia,
  });

  const categorySets = await Promise.all(
    (await readdir(join(project, ".generated/apps"))).slice(0, 8).map(async (slug) => {
      const app = await json(join(project, ".generated/apps", slug, "appstream.json"));
      return app.categories as string[];
    })
  );
  const templateRelease = (releaseLock.releases as Array<Record<string, unknown>>)[0]!;
  const templateArtifacts = templateRelease.artifacts as Array<Record<string, unknown>>;
  if (templateArtifacts.length < 2) throw new Error("scale fixture needs two artifact templates");

  for (let offset = 0; offset < appCount; offset += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, appCount - offset) }, async (_, batchIndex) => {
        const index = offset + batchIndex;
        const suffix = String(index).padStart(4, "0");
        const slug = `scale-app-${suffix}`;
        const id = `org.apphub.Scale${suffix}`;
        const name = `Scale App ${suffix}`;
        const appMetadata = {
          ...metadata,
          id,
          name,
          summary: `Synthetic scale fixture ${suffix}`,
          categories: categorySets[index % categorySets.length],
        };
        const generatedDirectory = join(fixture, ".generated/apps", slug);
        const appMedia = { ...media, screenshots };
        const artifacts = templateArtifacts.slice(0, 2).map((artifact, artifactIndex) => ({
          ...artifact,
          architecture: artifactIndex === 0 ? "x86_64" : "aarch64",
          name: `${slug}-${artifactIndex}.AppImage`,
          url: `https://github.com/example/apps/releases/download/v1/${slug}-${artifactIndex}.AppImage`,
          assetId: `${index}-${artifactIndex}`,
        }));

        await mkdir(generatedDirectory);
        await Promise.all([
          writeJson(join(fixture, "apps", `${slug}.json`), {
            appstream: {
              type: "manual",
              metadata: appMetadata,
              media: {
                icon: (media.icon as Record<string, string>).source,
                screenshots: screenshots.map(({ caption, captionTranslations, source }) => ({
                  caption,
                  ...(captionTranslations ? { captionTranslations } : {}),
                  source,
                })),
              },
            },
            addedAt: "2026-01-01",
            origin: { type: "third-party" },
            releaseSource: { type: "github", repository: "example/apps" },
            sandbox: templateManifest.sandbox,
            assets: { x86_64: "*.AppImage", aarch64: "*.AppImage" },
          }),
          writeJson(join(generatedDirectory, "appstream.json"), appMetadata),
          writeJson(join(generatedDirectory, "media.json"), appMedia),
          writeJson(join(generatedDirectory, "provenance.json"), provenance),
          writeJson(join(generatedDirectory, "releases.json"), {
            appId: id,
            releases: [{ ...templateRelease, artifacts }],
          }),
        ]);
      })
    );
  }

  await writeJson(join(fixture, ".generated/downloads.json"), { snapshots: [], refresh: {} });
  await writeJson(join(fixture, ".generated/stars.json"), { values: {}, refresh: {} });
  await writeJson(join(fixture, ".generated/star-etags.json"), {});
  await writeCatalogSnapshot(new Date("2026-09-12T12:00:00.000Z"), pathToFileURL(`${fixture}/`));

  const started = Date.now();
  await run("bun", ["run", "build", "--", "--silent"]);
  const durationMs = Date.now() - started;
  const siteBytes = await directorySize(join(fixture, "dist"));
  const categoryShards = (await readdir(join(fixture, "dist/search-index"))).filter((name) =>
    name.endsWith(".json")
  );

  if (durationMs > maximumBuildMilliseconds) throw new Error("scale build exceeded 8 minutes");
  if (siteBytes > maximumSiteBytes) throw new Error("scale build exceeded 500 MiB");
  if (categoryShards.length < 2) throw new Error("scale build did not produce category shards");

  console.log(
    JSON.stringify({
      apps: appCount,
      artifacts: artifactCount,
      durationMs,
      siteBytes,
      categoryShards,
    })
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
