import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { hashDownload, readApps, type Artifact, type ReleaseLock } from "@catalog/core";
import { fetchSourceReleases } from "./releases";
import type { SourceRelease } from "./releases/model";

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

  if (!releases) {
    console.log(`${app.id}: releases are maintained directly`);

    return;
  }

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

async function main() {
  const requestedSlug = process.argv[2];

  if (process.argv.length > 3) {
    throw new Error("Usage: bun run update-releases [slug]");
  }

  const entries = await readApps();
  const selected = requestedSlug ? entries.filter(({ slug }) => slug === requestedSlug) : entries;

  if (requestedSlug && selected.length === 0) {
    throw new Error(`Unknown application: ${requestedSlug}`);
  }

  for (const entry of selected) {
    await updateEntry(entry);
  }
}

if (import.meta.main) {
  await main();
}
