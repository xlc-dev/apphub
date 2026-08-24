import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { hashDownload, readApps, type Artifact, type ReleaseLock } from "#catalog/core";
import { fetchSourceReleases } from "#scripts/releases/index";
import type { SourceRelease } from "#scripts/releases/model";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

function verifyRecorded(appId: string, source: SourceRelease, lock: ReleaseLock) {
  const recorded = lock.releases.find(({ version }) => version === source.version);

  if (!recorded) {
    return false;
  }

  if (recorded.page !== source.page || recorded.publishedAt !== source.publishedAt) {
    throw new Error(`${appId} ${source.version}: published release metadata changed`);
  }

  if (recorded.artifacts.length !== source.artifacts.length) {
    throw new Error(`${appId} ${source.version}: published artifacts changed`);
  }

  for (const artifact of source.artifacts) {
    const existing = recorded.artifacts.find(
      ({ architecture }) => architecture === artifact.architecture
    );

    if (!existing) {
      throw new Error(`${appId} ${source.version}: published artifact changed`);
    }

    if (existing.name !== artifact.name || existing.url !== artifact.url) {
      throw new Error(`${appId} ${source.version}: published artifact changed`);
    }

    if (artifact.size !== undefined && existing.size !== artifact.size) {
      throw new Error(`${appId} ${source.version}: published artifact changed`);
    }

    if (artifact.sha256 && existing.sha256 !== artifact.sha256) {
      throw new Error(`${appId} ${source.version}: published checksum changed`);
    }
  }

  return true;
}

async function recordRelease(release: SourceRelease): Promise<ReleaseLock["releases"][number]> {
  const artifacts: Artifact[] = [];

  for (const artifact of release.artifacts) {
    const checksum =
      artifact.sha256 && artifact.size !== undefined
        ? { size: artifact.size, sha256: sha256.parse(artifact.sha256) }
        : await hashDownload(artifact);

    artifacts.push({ ...artifact, ...checksum });
  }

  return { ...release, artifacts };
}

async function updateEntry(entry: Awaited<ReturnType<typeof readApps>>[number]) {
  const { app, directory, lock } = entry;
  const releases = await fetchSourceReleases(app, lock);

  const updated = structuredClone(lock);

  for (const release of releases.reverse()) {
    if (!verifyRecorded(app.id, release, lock)) {
      updated.releases.unshift(await recordRelease(release));
    }
  }

  if (updated.releases.length === lock.releases.length) {
    console.log(`${app.id}: releases are current`);

    return;
  }

  await writeFile(new URL("releases.json", directory), `${JSON.stringify(updated, null, 2)}\n`);

  console.log(`${app.id}: found new releases`);
}

export async function generateReleases(
  generatedDirectory?: URL,
  requestedSlugs = process.argv.slice(2)
) {
  const slugs = new Set(requestedSlugs);
  const entries = await readApps(undefined, generatedDirectory, slugs.size ? slugs : undefined);

  if (entries.length !== slugs.size && slugs.size) {
    const found = new Set(entries.map(({ slug }) => slug));
    const unknown = requestedSlugs.find((slug) => !found.has(slug));

    throw new Error(`Unknown application: ${unknown}`);
  }

  for (const entry of entries) {
    await updateEntry(entry);
  }
}

if (import.meta.main) {
  await generateReleases();
}
