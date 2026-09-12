import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { refreshPlanSchema } from "#catalog/refresh-plan";
import {
  artifactInspectionSchema,
  catalogProvenanceSchema,
  generatedMediaSchema,
  releaseLockSchema,
  type Artifact,
} from "#catalog/schema";
import { generateCatalog } from "#scripts/generate-catalog";
import { readCatalogSnapshot } from "#catalog/snapshot";

const batchValue = process.env.APPHUB_REFRESH_BATCH;
const resultPath = process.env.APPHUB_REFRESH_RESULT;

if (!batchValue) throw new Error("APPHUB_REFRESH_BATCH is required");
if (!resultPath) throw new Error("APPHUB_REFRESH_RESULT is required");

const batch = refreshPlanSchema.shape.batches.element.parse(JSON.parse(batchValue));
const before = await readCatalogSnapshot();
const startedAt = new Date();

await generateCatalog({
  requestedSlugs: batch.slugs,
  failSoft: true,
  forceRefresh: process.env.FORCE_REFRESH === "1",
});

await mkdir(`${resultPath}/apps`, { recursive: true });
await mkdir(`${resultPath}/media`, { recursive: true });
const media = new Set<string>();
const failures: Array<{
  slug: string;
  unit: "metadata" | "releases";
  category: "network" | "rate-limit" | "not-found" | "invalid-data" | "integrity";
  consecutiveFailures: number;
}> = [];
const inspections: Array<{
  slug: string;
  architecture: string;
  sha256: string;
  inspection: NonNullable<Artifact["inspection"]>;
}> = [];

for (const slug of batch.slugs) {
  await cp(`.generated/apps/${slug}`, `${resultPath}/apps/${slug}`, { recursive: true });
  const appMedia = generatedMediaSchema.parse(
    JSON.parse(await readFile(`.generated/apps/${slug}/media.json`, "utf8"))
  );
  media.add(appMedia.icon.file);
  for (const screenshot of appMedia.screenshots) media.add(screenshot.file);

  const provenance = catalogProvenanceSchema.parse(
    JSON.parse(await readFile(`.generated/apps/${slug}/provenance.json`, "utf8"))
  );
  for (const unit of ["metadata", "releases"] as const) {
    const state = provenance.refresh[unit];
    if (state.incident && Date.parse(state.lastAttemptAt) >= startedAt.getTime()) {
      failures.push({ slug, unit, ...state.incident });
    }
  }
  let releases;
  try {
    releases = releaseLockSchema.parse(
      JSON.parse(await readFile(`.generated/apps/${slug}/releases.json`, "utf8"))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!releases) continue;
  for (const release of releases.releases) {
    for (const artifact of release.artifacts) {
      if (artifact.inspection) {
        inspections.push({
          slug,
          architecture: artifact.architecture,
          sha256: artifact.sha256,
          inspection: artifactInspectionSchema.parse(artifact.inspection),
        });
      }
    }
  }
}

for (const file of media) {
  await cp(`.generated/media/${file}`, `${resultPath}/media/${file}`);
}

const files = [...media].sort();
const digest = createHash("sha256");

for (const slug of batch.slugs) {
  for (const file of (await readdir(`${resultPath}/apps/${slug}`)).sort()) {
    digest.update(`apps/${slug}/${file}\0`);
    digest.update(await readFile(`${resultPath}/apps/${slug}/${file}`));
  }
}
for (const file of files) {
  digest.update(`media/${file}\0`);
  digest.update(await readFile(`${resultPath}/media/${file}`));
}

await writeFile(
  `${resultPath}/result.json`,
  `${JSON.stringify({ id: batch.id, baseRevision: before.revision, slugs: batch.slugs, media: files, failures, inspections, digest: digest.digest("hex") }, null, 2)}\n`
);
