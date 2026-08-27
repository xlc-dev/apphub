import { z } from "zod";

export const refreshIncidentCategorySchema = z.enum([
  "network",
  "rate-limit",
  "not-found",
  "invalid-data",
  "integrity",
]);

export const httpValidatorSchema = z
  .object({
    etag: z.string().min(1).optional(),
    lastModified: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.etag ?? value.lastModified), "HTTP validator must not be empty");

export type HttpValidator = z.infer<typeof httpValidatorSchema>;

export const refreshStateSchema = z
  .object({
    lastAttemptAt: z.iso.datetime(),
    lastSuccessAt: z.iso.datetime().optional(),
    incident: z
      .object({
        category: refreshIncidentCategorySchema,
        consecutiveFailures: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const successfulRefreshStateSchema = refreshStateSchema
  .extend({ lastSuccessAt: z.iso.datetime() })
  .strict();

export type RefreshState = z.infer<typeof refreshStateSchema>;
export type SuccessfulRefreshState = z.infer<typeof successfulRefreshStateSchema>;
export type RefreshIncidentCategory = z.infer<typeof refreshIncidentCategorySchema>;

export class RefreshError extends Error {
  constructor(
    readonly category: RefreshIncidentCategory,
    message: string
  ) {
    super(message);
  }
}

export const catalogStatusSchema = z.enum(["current", "stale", "unavailable", "quarantined"]);
export type CatalogStatus = z.infer<typeof catalogStatusSchema>;

export const staleAfterDays = {
  metadata: 30,
  releases: 3,
  statistics: 7,
} as const;

export const refreshEveryHours = {
  metadata: 7 * 24,
  releases: 20,
  statistics: 20,
} as const;

const failedRefreshInterval = 6 * 60 * 60 * 1000;

export function isRefreshDue(state: RefreshState | undefined, hours: number, now = new Date()) {
  if (!state) return true;

  const anchor = state.incident
    ? state.lastAttemptAt
    : (state.lastSuccessAt ?? state.lastAttemptAt);
  const interval = state.incident ? failedRefreshInterval : hours * 60 * 60 * 1000;

  return now.getTime() - Date.parse(anchor) >= interval;
}

export function refreshSucceeded(at: string): SuccessfulRefreshState {
  return { lastAttemptAt: at, lastSuccessAt: at };
}

export function refreshFailed(
  previous: SuccessfulRefreshState,
  at: string,
  category: RefreshIncidentCategory
): SuccessfulRefreshState;
export function refreshFailed(
  previous: RefreshState | undefined,
  at: string,
  category: RefreshIncidentCategory
): RefreshState;
export function refreshFailed(
  previous: RefreshState | undefined,
  at: string,
  category: RefreshIncidentCategory
): RefreshState {
  return {
    ...previous,
    lastAttemptAt: at,
    incident: {
      category,
      consecutiveFailures:
        previous?.incident?.category === category ? previous.incident.consecutiveFailures + 1 : 1,
    },
  };
}

export function isStale(state: RefreshState, days: number, now = new Date()) {
  if (!state.lastSuccessAt) return true;

  return now.getTime() - Date.parse(state.lastSuccessAt) > days * 24 * 60 * 60 * 1000;
}

export function catalogStatus(
  metadata: RefreshState,
  releases: RefreshState,
  now = new Date()
): CatalogStatus {
  if (metadata.incident?.category === "integrity" || releases.incident?.category === "integrity") {
    return "quarantined";
  }

  if (releases.incident?.category === "not-found" && releases.incident.consecutiveFailures >= 3) {
    return "unavailable";
  }

  if (
    isStale(metadata, staleAfterDays.metadata, now) ||
    isStale(releases, staleAfterDays.releases, now)
  ) {
    return "stale";
  }

  return "current";
}

export function classifyRefreshError(error: unknown): RefreshIncidentCategory {
  if (error instanceof RefreshError) return error.category;

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  if (/\b(?:404|410)\b|not found|no current release/i.test(message)) return "not-found";
  if (/\b429\b|rate.?limit|retry.after/i.test(message)) return "rate-limit";
  if (/\b5\d\d\b|timeout|abort|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return "network";
  }

  return "invalid-data";
}

function retryDelay(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  const retryAfter = /retry after (.+)$/i.exec(message)?.[1]?.replace(/ seconds$/i, "");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - Date.now();

    if (Number.isFinite(milliseconds) && milliseconds > 0) {
      return Math.min(milliseconds, 30_000);
    }
  }

  return attempt === 1 ? 1_000 : 5_000;
}

export async function retryRefresh<T>(operation: () => T | Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const category = classifyRefreshError(error);

      if (attempt === 3 || (category !== "network" && category !== "rate-limit")) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay(error, attempt)));
    }
  }
}
