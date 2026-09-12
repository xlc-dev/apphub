import { cp, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readApps } from "#catalog/storage";
import { readCatalogSnapshot } from "#catalog/snapshot";
import { refreshPlanSchema, validateRefreshResults } from "#catalog/refresh-plan";
import {
  architectureSchema,
  artifactInspectionSchema,
  generatedMediaSchema,
} from "#catalog/schema";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z
  .object({
    id: refreshPlanSchema.shape.batches.element.shape.id,
    baseRevision: hash,
    slugs: z.array(z.string()),
    media: z.array(z.string()),
    failures: z.array(
      z
        .object({
          slug: z.string(),
          unit: z.enum(["metadata", "releases"]),
          category: z.enum(["network", "rate-limit", "not-found", "invalid-data", "integrity"]),
          consecutiveFailures: z.number().int().positive(),
        })
        .strict()
    ),
    inspections: z.array(
      z
        .object({
          slug: z.string(),
          architecture: architectureSchema,
          sha256: hash,
          inspection: artifactInspectionSchema,
        })
        .strict()
    ),
    digest: hash,
  })
  .strict();

const planPath = process.env.APPHUB_REFRESH_PLAN;
const resultsDirectory = process.env.APPHUB_REFRESH_RESULTS;

if (!planPath) throw new Error("APPHUB_REFRESH_PLAN is required");
if (!resultsDirectory) throw new Error("APPHUB_REFRESH_RESULTS is required");

const plan = refreshPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
const snapshot = await readCatalogSnapshot();
const staged = `.generated.finalize-${process.pid}`;
const backup = `.generated.backup-${process.pid}`;

await cp(".generated", staged, { recursive: true, force: false, errorOnExist: true });
await mkdir(`${staged}/media`, { recursive: true });

try {
  const results = await Promise.all(
    plan.batches.map(async (batch) =>
      resultSchema.parse(
        JSON.parse(await readFile(`${resultsDirectory}/${batch.id}/result.json`, "utf8"))
      )
    )
  );

  validateRefreshResults(plan, snapshot.revision, results);

  for (const batch of plan.batches) {
    const directory = `${resultsDirectory}/${batch.id}`;
    const result = results.find(({ id }) => id === batch.id)!;

    const digest = createHash("sha256");
    for (const slug of batch.slugs) {
      for (const file of (await readdir(`${directory}/apps/${slug}`)).sort()) {
        digest.update(`apps/${slug}/${file}\0`);
        digest.update(await readFile(`${directory}/apps/${slug}/${file}`));
      }
    }
    for (const file of result.media) {
      const data = await readFile(`${directory}/media/${file}`);
      digest.update(`media/${file}\0`);
      digest.update(data);
      await cp(`${directory}/media/${file}`, `${staged}/media/${file}`);
    }
    if (digest.digest("hex") !== result.digest)
      throw new Error(`${batch.id}: result digest mismatch`);

    for (const slug of batch.slugs) {
      await rm(`${staged}/apps/${slug}`, { recursive: true, force: true });
      await cp(`${directory}/apps/${slug}`, `${staged}/apps/${slug}`, { recursive: true });
    }
  }

  const referenced = new Set<string>();
  for (const slug of await readdir(`${staged}/apps`)) {
    const media = generatedMediaSchema.parse(
      JSON.parse(await readFile(`${staged}/apps/${slug}/media.json`, "utf8"))
    );
    referenced.add(media.icon.file);
    for (const screenshot of media.screenshots) referenced.add(screenshot.file);
  }
  for (const file of await readdir(`${staged}/media`)) {
    if (!referenced.has(file)) await rm(`${staged}/media/${file}`);
  }

  await readApps(undefined, pathToFileURL(`${process.cwd()}/${staged}/apps/`));

  await rename(".generated", backup);
  try {
    await rename(staged, ".generated");
  } catch (error) {
    await rename(backup, ".generated");
    throw error;
  }
  await rm(backup, { recursive: true });
} catch (error) {
  await rm(staged, { recursive: true, force: true });
  throw error;
}
