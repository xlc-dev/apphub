import { describe, expect, test } from "bun:test";
import { failed, healthy } from "@catalog/health";
import { healthSchema } from "@catalog/schema";

const checkedAt = "2026-08-20T12:00:00Z";

describe("catalog health", () => {
  test("clears failures after a successful check", () => {
    expect(healthy(checkedAt)).toEqual({
      status: "healthy",
      checkedAt,
      consecutiveFailures: 0,
    });
  });

  test("degrades before becoming unavailable", () => {
    const first = failed(undefined, checkedAt, new Error("not found"));
    const second = failed(first, checkedAt, new Error("not found"));
    const third = failed(second, checkedAt, new Error("not found"));

    expect(first.status).toBe("degraded");
    expect(second.status).toBe("degraded");
    expect(third.status).toBe("unavailable");
    expect(healthSchema.parse(third)).toEqual(third);
  });

  test("bounds stored errors", () => {
    expect(failed(undefined, checkedAt, "x".repeat(1_000)).error).toHaveLength(500);
  });
});
