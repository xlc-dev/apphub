import { appendFile, readFile, writeFile } from "node:fs/promises";
import { readAppManifests } from "#catalog/storage";
import { catalogProvenanceSchema } from "#catalog/schema";
import { createRefreshPlan } from "#catalog/refresh-plan";
import { isRefreshDue, refreshEveryHours } from "#catalog/refresh";

const force = process.env.FORCE_REFRESH === "1";
const now = new Date();
const due = [];

for (const [slug] of await readAppManifests()) {
  const provenance = catalogProvenanceSchema.parse(
    JSON.parse(await readFile(`.generated/apps/${slug}/provenance.json`, "utf8"))
  );

  if (
    force ||
    isRefreshDue(provenance.refresh.metadata, refreshEveryHours.metadata, now) ||
    isRefreshDue(provenance.refresh.releases, refreshEveryHours.releases, now)
  ) {
    due.push(slug);
  }
}

const plan = createRefreshPlan(due);
const output = process.env.GITHUB_OUTPUT;
const planPath = process.env.APPHUB_REFRESH_PLAN;

if (planPath) await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });

if (output) {
  await appendFile(output, `matrix=${JSON.stringify({ include: plan.batches })}\n`);
  await appendFile(output, `count=${plan.batches.length}\n`);
} else {
  console.log(JSON.stringify(plan, null, 2));
}
