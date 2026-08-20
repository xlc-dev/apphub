import type { Health } from "@catalog/schema";

export function healthy(checkedAt: string): Health {
  return { status: "healthy", checkedAt, consecutiveFailures: 0 };
}

export function failed(previous: Health | undefined, checkedAt: string, error: unknown): Health {
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  const message = error instanceof Error ? error.message : String(error);

  return {
    status: consecutiveFailures >= 3 ? "unavailable" : "degraded",
    checkedAt,
    consecutiveFailures,
    error: message.slice(0, 500),
  };
}
