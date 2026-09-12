import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { downloadCounts, downloadHistorySchema, latestDownloadDate } from "#catalog/downloads";
import { readApps } from "#catalog/storage";
import { imageType } from "#catalog/media";
import { catalogStatus } from "#catalog/refresh";
import { readRevokedHashes } from "#catalog/tuf/revocations";
import { readCatalogSnapshot } from "#catalog/snapshot";
import { getRepositoryStarData } from "#lib/repository-stars";
import { mediaUrl } from "#media-loader";
import {
  catalogAppResourceSchema,
  catalogAppSchema,
  type CatalogApp,
  type CatalogAppResource,
} from "#lib/catalog-model";

const downloadsUrl = pathToFileURL(`${process.cwd()}/.generated/downloads.json`);

let appsPromise: Promise<CatalogApp[]> | undefined;
let downloadHistoryPromise: Promise<z.infer<typeof downloadHistorySchema>> | undefined;
let resourcesPromise: Promise<CatalogAppResource[]> | undefined;
const snapshot = await readCatalogSnapshot();
const snapshotTime = new Date(snapshot.generatedAt);
const collator = new Intl.Collator("en");

export function getCatalogSnapshot() {
  return snapshot;
}

export function getCatalogSnapshotTime() {
  return snapshotTime;
}

async function loadApps() {
  const [entries, revoked] = await Promise.all([readApps(), readRevokedHashes()]);
  const apps = entries
    .map(({ slug, iconFile, app, lock }) => {
      const { assets: _assets, releaseSource: _releaseSource, ...manifest } = app;
      const { validator: _metadataValidator, ...metadataProvenance } = app.provenance.metadata;
      const { validator: _releaseValidator, ...releaseProvenance } = app.provenance.releaseSource;

      const refreshStatus = catalogStatus(
        app.provenance.refresh.metadata,
        app.provenance.refresh.releases,
        snapshotTime
      );
      const isRevoked = lock.releases.some((release) =>
        release.artifacts.some(({ sha256 }) => revoked.has(sha256))
      );
      const status = isRevoked ? "revoked" : refreshStatus;
      const mayInstall = status === "current" || status === "stale";
      const releases = lock.releases.map((release) => ({
        ...release,
        artifacts: release.artifacts.map((artifact) => ({
          ...artifact,
          installable: Boolean(artifact.inspection) && mayInstall && !revoked.has(artifact.sha256),
        })),
      }));

      return {
        ...manifest,
        slug,
        icon: {
          ...app.icon,
          url: mediaUrl(iconFile),
          type: imageType(iconFile),
        },
        screenshots: app.screenshots.map(({ file, ...screenshot }) => ({
          ...screenshot,
          url: mediaUrl(file),
          type: imageType(file),
        })),
        releases,
        provenance: {
          ...app.provenance,
          metadata: metadataProvenance,
          releaseSource: releaseProvenance,
        },
        status,
      };
    })
    .sort(
      (left, right) =>
        collator.compare(left.name, right.name) || collator.compare(left.slug, right.slug)
    );

  return z.array(catalogAppSchema).parse(apps);
}

export function getApps() {
  return (appsPromise ??= loadApps());
}

async function loadDownloadHistory() {
  const data = await readFile(downloadsUrl, "utf8");

  return downloadHistorySchema.parse(JSON.parse(data));
}

export function getDownloadHistory() {
  return (downloadHistoryPromise ??= loadDownloadHistory());
}

export async function getAppDownloads(appId: string) {
  return downloadCounts(await getDownloadHistory())?.[appId];
}

async function loadCatalogApps() {
  const [apps, history, stars] = await Promise.all([
    getApps(),
    getDownloadHistory(),
    getRepositoryStarData(),
  ]);
  const week = downloadCounts(history, 7);
  const month = downloadCounts(history, 30);
  const allTime = downloadCounts(history);
  const updatedAt = latestDownloadDate(history);

  return z.array(catalogAppResourceSchema).parse(
    apps.map((app) => ({
      ...app,
      statistics: {
        stars: stars.values[app.slug] ?? null,
        downloads: {
          updatedAt,
          week: week?.[app.id] ?? null,
          month: month?.[app.id] ?? null,
          allTime: allTime?.[app.id] ?? null,
        },
        refresh: {
          downloads: history.refresh[app.id],
          stars: stars.refresh[app.slug],
        },
      },
    }))
  );
}

export function getCatalogApps() {
  return (resourcesPromise ??= loadCatalogApps());
}
