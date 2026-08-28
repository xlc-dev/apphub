import { appendFile, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { readAppManifests } from "#catalog/storage";
import { downloadHistorySchema } from "#catalog/downloads";
import {
  catalogStatus,
  catalogStatusSchema,
  isStale,
  refreshStateSchema,
  staleAfterDays,
  type RefreshState,
} from "#catalog/refresh";
import { catalogProvenanceSchema } from "#catalog/schema";
import { catalogSnapshotSchema, readCatalogSnapshot } from "#catalog/snapshot";
import { repositoryStarsSchema } from "#lib/repository-stars";

const statePath = process.env.APPHUB_REFRESH_STATE ?? "/tmp/apphub-refresh-state.json";
const reportPath = process.env.APPHUB_REFRESH_REPORT ?? "/tmp/apphub-refresh-report.json";
const networkPath = process.env.APPHUB_REFRESH_NETWORK_REPORT ?? "/tmp/apphub-refresh-network.json";
const generatedDirectory = new URL("../.generated/", import.meta.url);
const units = ["metadata", "releases", "downloads", "stars"] as const;
const refreshUnitSchema = z.enum(units);

const capturedAppSchema = z
  .object({
    slug: z.string(),
    status: catalogStatusSchema,
    staleUnits: z.array(refreshUnitSchema),
    units: z
      .object({
        metadata: refreshStateSchema.optional(),
        releases: refreshStateSchema.optional(),
        downloads: refreshStateSchema.optional(),
        stars: refreshStateSchema.optional(),
      })
      .strict(),
  })
  .strict();

const capturedRefreshStateSchema = z
  .object({
    startedAt: z.iso.datetime(),
    revision: catalogSnapshotSchema.shape.revision,
    apps: z.record(z.string(), capturedAppSchema),
  })
  .strict();

const networkReportSchema = z
  .object({
    durationMs: z.number().nonnegative(),
    requests: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    hosts: z.record(
      z.string(),
      z
        .object({
          requests: z.number().int().nonnegative(),
          bytes: z.number().int().nonnegative(),
          blockedUntil: z.iso.datetime().optional(),
        })
        .strict()
    ),
  })
  .strict();

const refreshReportCheckSchema = z.object({ alerts: z.array(z.unknown()) });

type RefreshUnit = (typeof units)[number];
export type CapturedApp = z.infer<typeof capturedAppSchema>;
export type CapturedRefreshState = z.infer<typeof capturedRefreshStateSchema>;
type NetworkReport = z.infer<typeof networkReportSchema>;

function emptyCounts<T extends string>(values: readonly T[]) {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

async function captureRefreshState(now = new Date()): Promise<CapturedRefreshState> {
  const [manifests, history, stars, snapshot] = await Promise.all([
    readAppManifests(),
    readJson(new URL("downloads.json", generatedDirectory).pathname).then((value) =>
      downloadHistorySchema.parse(value)
    ),
    readJson(new URL("stars.json", generatedDirectory).pathname).then((value) =>
      repositoryStarsSchema.parse(value)
    ),
    readCatalogSnapshot(),
  ]);
  const apps: Record<string, CapturedApp> = {};

  for (const [slug, manifest] of manifests) {
    const provenance = catalogProvenanceSchema.parse(
      await readJson(new URL(`apps/${slug}/provenance.json`, generatedDirectory).pathname)
    );
    const appId =
      manifest.appstream.type === "manual" ? manifest.appstream.metadata.id : manifest.appstream.id;
    const unitStates: Partial<Record<RefreshUnit, RefreshState>> = {
      metadata: provenance.refresh.metadata,
      releases: provenance.refresh.releases,
      ...(history.refresh[appId] ? { downloads: history.refresh[appId] } : {}),
      ...(stars.refresh[slug] ? { stars: stars.refresh[slug] } : {}),
    };
    const staleUnits = units.filter((unit) => {
      const state = unitStates[unit];

      if (!state) return false;

      const days =
        unit === "metadata"
          ? staleAfterDays.metadata
          : unit === "releases"
            ? staleAfterDays.releases
            : staleAfterDays.statistics;

      return isStale(state, days, now);
    });

    apps[appId] = {
      slug,
      status: catalogStatus(provenance.refresh.metadata, provenance.refresh.releases, now),
      staleUnits,
      units: unitStates,
    };
  }

  return {
    startedAt: now.toISOString(),
    revision: snapshot.revision,
    apps,
  };
}

export function createRefreshReport(
  before: CapturedRefreshState,
  after: CapturedRefreshState,
  network: NetworkReport
) {
  const status = emptyCounts(["current", "stale", "unavailable", "quarantined"] as const);
  const incidents = emptyCounts([
    "network",
    "rate-limit",
    "not-found",
    "invalid-data",
    "integrity",
  ] as const);
  const attempted = new Set<string>();
  const failed = new Set<string>();
  const persistentFailures: Array<{
    appId: string;
    slug: string;
    unit: RefreshUnit;
    category: keyof typeof incidents;
    consecutiveFailures: number;
  }> = [];
  const staleResources: Array<{ appId: string; slug: string; unit: RefreshUnit }> = [];
  const alerts: Array<{
    appId: string;
    slug: string;
    kind: "quarantined" | "unavailable" | "persistent-failure";
  }> = [];
  const startedAt = Date.parse(before.startedAt);

  for (const [appId, app] of Object.entries(after.apps)) {
    status[app.status]++;

    for (const unit of app.staleUnits) staleResources.push({ appId, slug: app.slug, unit });

    for (const unit of units) {
      const state = app.units[unit];

      if (!state) continue;

      if (Date.parse(state.lastAttemptAt) >= startedAt) attempted.add(appId);

      if (state.incident) {
        incidents[state.incident.category]++;

        if (Date.parse(state.lastAttemptAt) >= startedAt) failed.add(appId);

        if (state.incident.consecutiveFailures >= 3) {
          persistentFailures.push({
            appId,
            slug: app.slug,
            unit,
            category: state.incident.category,
            consecutiveFailures: state.incident.consecutiveFailures,
          });
        }
      }
    }

    const previous = before.apps[appId];

    if (app.status === "quarantined" && previous?.status !== "quarantined") {
      alerts.push({ appId, slug: app.slug, kind: "quarantined" });
      continue;
    }

    if (app.status === "unavailable" && previous?.status !== "unavailable") {
      alerts.push({ appId, slug: app.slug, kind: "unavailable" });
      continue;
    }

    const crossedThreshold = units.some((unit) => {
      const current = app.units[unit]?.incident?.consecutiveFailures ?? 0;
      const old = previous?.units[unit]?.incident?.consecutiveFailures ?? 0;

      return old < 3 && current >= 3;
    });

    if (crossedThreshold) {
      alerts.push({ appId, slug: app.slug, kind: "persistent-failure" });
    }
  }

  return {
    startedAt: before.startedAt,
    completedAt: after.startedAt,
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    catalogChanged: before.revision !== after.revision,
    apps: {
      total: Object.keys(after.apps).length,
      attempted: attempted.size,
      failed: failed.size,
      ...status,
    },
    incidents,
    staleResources,
    persistentFailures,
    rateLimitedProviders: Object.entries(network.hosts).flatMap(([host, value]) =>
      value.blockedUntil ? [{ host, blockedUntil: value.blockedUntil }] : []
    ),
    network,
    alerts,
  };
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function addSummaryList(lines: string[], title: string, items: string[]) {
  if (!items.length) return;

  lines.push("", `${title}:`);
  for (const item of items.slice(0, 20)) lines.push(`- ${item}`);

  if (items.length > 20) lines.push(`- ${items.length - 20} more in the JSON report`);
}

function summary(report: ReturnType<typeof createRefreshReport>) {
  const changed = report.catalogChanged ? "changed" : "unchanged";
  const lines = [
    "## Catalog refresh",
    "",
    `Catalog ${changed}: \`${report.revisionAfter.slice(0, 12)}\``,
    "",
    "| Apps | Count |",
    "| --- | ---: |",
    `| Total | ${report.apps.total} |`,
    `| Attempted | ${report.apps.attempted} |`,
    `| Failed this run | ${report.apps.failed} |`,
    `| Current | ${report.apps.current} |`,
    `| Stale | ${report.apps.stale} |`,
    `| Unavailable | ${report.apps.unavailable} |`,
    `| Quarantined | ${report.apps.quarantined} |`,
    "",
    `Network: ${report.network.requests} requests, ${(report.network.bytes / 1024 / 1024).toFixed(1)} MiB, ${(report.network.durationMs / 1000).toFixed(1)} seconds.`,
  ];
  const incidentSummary = Object.entries(report.incidents)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category} ${count}`)
    .join(", ");

  if (incidentSummary) lines.push("", `Incidents: ${incidentSummary}.`);

  if (report.rateLimitedProviders.length) {
    lines.push(
      "",
      `Rate limited: ${report.rateLimitedProviders.map(({ host }) => host).join(", ")}.`
    );
  }

  addSummaryList(
    lines,
    "Persistent failures",
    report.persistentFailures.map(
      (failure) =>
        `${failure.slug}: ${failure.unit} ${failure.category} (${failure.consecutiveFailures} consecutive)`
    )
  );
  addSummaryList(
    lines,
    "Stale resources",
    report.staleResources.map((resource) => `${resource.slug}: ${resource.unit}`)
  );
  addSummaryList(
    lines,
    "Alerts",
    report.alerts.map((alert) => `${alert.slug}: ${alert.kind}`)
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const command = process.argv[2];

  if (command === "capture") {
    await writeFile(statePath, `${JSON.stringify(await captureRefreshState(), null, 2)}\n`);

    return;
  }

  if (command === "report") {
    const before = capturedRefreshStateSchema.parse(await readJson(statePath));
    const network = networkReportSchema.parse(await readJson(networkPath));
    const report = createRefreshReport(before, await captureRefreshState(), network);

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
    }

    console.log(
      `Refresh report: ${report.apps.attempted} attempted, ${report.apps.failed} failed, ${report.alerts.length} alerts.`
    );

    return;
  }

  if (command === "check") {
    const report = refreshReportCheckSchema.parse(await readJson(reportPath));

    if (report.alerts.length) {
      throw new Error(`${report.alerts.length} catalog maintenance alert(s) require review`);
    }

    return;
  }

  throw new Error("Usage: refresh-report.ts capture|report|check");
}

if (import.meta.main) await main();
