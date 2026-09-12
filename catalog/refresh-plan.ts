import { z } from "zod";

export const maximumRefreshBatchSize = 50;

export const refreshPlanSchema = z
  .object({
    batches: z.array(
      z
        .object({
          id: z.string().regex(/^batch-[0-9]{4}$/),
          slugs: z.array(z.string()).min(1).max(maximumRefreshBatchSize),
        })
        .strict()
    ),
  })
  .strict();

export interface RefreshResultSummary {
  id: string;
  baseRevision: string;
  slugs: string[];
}

export function createRefreshPlan(slugs: string[], batchSize = maximumRefreshBatchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > maximumRefreshBatchSize) {
    throw new Error(`refresh batch size must be between 1 and ${maximumRefreshBatchSize}`);
  }

  const sorted = [...new Set(slugs)].sort();
  const batches = [];

  for (let offset = 0; offset < sorted.length; offset += batchSize) {
    batches.push({
      id: `batch-${String(batches.length).padStart(4, "0")}`,
      slugs: sorted.slice(offset, offset + batchSize),
    });
  }

  return refreshPlanSchema.parse({ batches });
}

export function validateRefreshResults(
  plan: z.infer<typeof refreshPlanSchema>,
  revision: string,
  results: RefreshResultSummary[]
) {
  const byId = new Map(results.map((result) => [result.id, result]));

  if (byId.size !== results.length || results.length !== plan.batches.length) {
    throw new Error("refresh result set is incomplete or contains duplicates");
  }

  for (const batch of plan.batches) {
    const result = byId.get(batch.id);

    if (!result) throw new Error(`${batch.id}: worker result is missing`);
    if (result.baseRevision !== revision) {
      throw new Error(`${batch.id}: worker used a different base catalog revision`);
    }
    if (
      result.slugs.length !== batch.slugs.length ||
      result.slugs.some((slug, index) => slug !== batch.slugs[index])
    ) {
      throw new Error(`${batch.id}: worker result does not match the refresh plan`);
    }
  }
}
