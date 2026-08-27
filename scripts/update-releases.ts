import { hashDownload } from "#catalog/artifacts";
import { readApps } from "#catalog/storage";
import { mergeReleaseSource, reconcileRelease } from "#catalog/provenance";
import {
  classifyRefreshError,
  isRefreshDue,
  refreshEveryHours,
  refreshFailed,
  refreshSucceeded,
  retryRefresh,
  RefreshError,
} from "#catalog/refresh";
import { printRefreshNetworkSummary } from "#catalog/network";
import type { Artifact, ReleaseLock } from "#catalog/schema";
import { writeJsonAtomic } from "#scripts/files";
import { forEachConcurrent } from "#scripts/concurrency";
import { fetchSourceReleases } from "#scripts/releases/index";
import type { SourceRelease, SourceResult } from "#scripts/releases/model";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

const maximumArtifactSize = 2 * 1024 * 1024 * 1024;
const maximumReleaseSize = 4 * 1024 * 1024 * 1024;

function canReuseObservation(
  recorded: Artifact | undefined,
  observed: SourceRelease["artifacts"][number]
): recorded is Artifact {
  return Boolean(
    recorded?.assetId &&
    recorded.assetId === observed.assetId &&
    (observed.size === undefined || recorded.size === observed.size) &&
    observed.publishedSha256?.value === recorded.sha256
  );
}

async function recordRelease(
  release: SourceRelease,
  recorded?: ReleaseLock["releases"][number]
): Promise<ReleaseLock["releases"][number]> {
  const artifacts: Artifact[] = [];
  let releaseSize = 0;

  for (const artifact of release.artifacts) {
    const existing = recorded?.artifacts.find(
      ({ architecture }) => architecture === artifact.architecture
    );
    const remaining = maximumReleaseSize - releaseSize;
    const limit = Math.min(maximumArtifactSize, remaining);

    if (limit <= 0) {
      throw new Error(`${release.version}: artifacts exceed the combined download limit`);
    }

    const observed = canReuseObservation(existing, artifact)
      ? { size: existing.size, sha256: existing.sha256 }
      : await hashDownload(artifact, { maximumSize: limit });

    if (artifact.publishedSha256 && artifact.publishedSha256.value !== observed.sha256) {
      throw new RefreshError(
        "integrity",
        `${artifact.name}: upstream checksum does not match downloaded bytes`
      );
    }

    const { publishedSha256, ...recordedArtifact } = artifact;

    artifacts.push({
      ...recordedArtifact,
      size: observed.size,
      sha256: observed.sha256,
      ...(publishedSha256 ? { checksumEvidence: { sourceUrl: publishedSha256.sourceUrl } } : {}),
    });
    releaseSize += observed.size;
  }

  return { ...release, artifacts };
}

async function updateEntry(entry: Awaited<ReturnType<typeof readApps>>[number]) {
  const { app, directory, lock } = entry;
  const { updated, provenance } = await retryRefresh(async () => {
    const result: SourceResult = await fetchSourceReleases(app, lock);

    if (result.notModified) {
      const succeededAt = new Date().toISOString();

      return {
        updated: lock,
        provenance: {
          ...app.provenance,
          releaseSource: mergeReleaseSource(app.provenance.releaseSource, result.source),
          refresh: {
            ...app.provenance.refresh,
            releases: refreshSucceeded(succeededAt),
          },
        },
      };
    }

    const release = result.releases[0];

    if (!release) {
      throw new RefreshError("not-found", `${app.id}: release source returned no current release`);
    }

    const observed = await recordRelease(release, lock.releases[0]);
    const succeededAt = new Date().toISOString();

    return {
      updated: {
        appId: app.id,
        releases: [reconcileRelease(lock.releases[0], observed)],
      } satisfies ReleaseLock,
      provenance: {
        ...app.provenance,
        releaseSource: mergeReleaseSource(app.provenance.releaseSource, result.source),
        refresh: {
          ...app.provenance.refresh,
          releases: refreshSucceeded(succeededAt),
        },
      },
    };
  });

  await Promise.all([
    writeJsonAtomic(new URL("releases.json", directory), updated),
    writeJsonAtomic(new URL("provenance.json", directory), provenance),
  ]);

  console.log(`${app.id}: recorded current release and provenance`);
}

export async function generateReleases(
  generatedDirectory?: URL,
  requestedSlugs = process.argv.slice(2),
  { failSoft = false, forceRefresh = false }: { failSoft?: boolean; forceRefresh?: boolean } = {}
) {
  const slugs = new Set(requestedSlugs);
  const entries = await readApps(undefined, generatedDirectory, slugs.size ? slugs : undefined);

  if (entries.length !== slugs.size && slugs.size) {
    const found = new Set(entries.map(({ slug }) => slug));
    const unknown = requestedSlugs.find((slug) => !found.has(slug));

    throw new Error(`Unknown application: ${unknown}`);
  }

  const refreshTime = new Date();

  await forEachConcurrent(entries, 4, async (entry) => {
    if (
      failSoft &&
      !forceRefresh &&
      !isRefreshDue(entry.app.provenance.refresh.releases, refreshEveryHours.releases, refreshTime)
    ) {
      return;
    }

    try {
      await updateEntry(entry);
    } catch (error) {
      if (!failSoft) throw error;

      const provenance = {
        ...entry.app.provenance,
        refresh: {
          ...entry.app.provenance.refresh,
          releases: refreshFailed(
            entry.app.provenance.refresh.releases,
            new Date().toISOString(),
            classifyRefreshError(error)
          ),
        },
      };

      await writeJsonAtomic(new URL("provenance.json", entry.directory), provenance);
      console.warn(`${entry.slug}: kept release after refresh failure: ${String(error)}`);
    }
  });
}

if (import.meta.main) {
  try {
    await generateReleases();
    await writeCatalogSnapshot();
  } finally {
    await printRefreshNetworkSummary();
  }
}
