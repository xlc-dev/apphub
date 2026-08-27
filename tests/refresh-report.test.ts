import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRefreshReport,
  type CapturedApp,
  type CapturedRefreshState,
} from "#scripts/refresh-report";

const start = "2026-08-26T10:00:00.000Z";
const attempt = "2026-08-26T10:01:00.000Z";
const success = "2026-08-25T10:00:00.000Z";

function app(slug: string, overrides: Partial<CapturedApp> = {}): CapturedApp {
  return {
    slug,
    status: "current",
    staleUnits: [],
    units: {
      metadata: { lastAttemptAt: success, lastSuccessAt: success },
      releases: { lastAttemptAt: success, lastSuccessAt: success },
    },
    ...overrides,
  };
}

function state(apps: Record<string, CapturedApp>): CapturedRefreshState {
  return { startedAt: start, revision: "a".repeat(64), apps };
}

const network = {
  durationMs: 2_000,
  requests: 3,
  bytes: 1_024,
  hosts: {
    "api.example.org": {
      requests: 3,
      bytes: 1_024,
      blockedUntil: "2026-08-26T11:00:00.000Z",
    },
  },
};

test("refresh reports alert once per app on important transitions", () => {
  const before = state({
    unavailable: app("unavailable", {
      units: {
        releases: {
          lastAttemptAt: success,
          lastSuccessAt: success,
          incident: { category: "not-found", consecutiveFailures: 2 },
        },
      },
    }),
    quarantined: app("quarantined"),
    persistent: app("persistent", {
      units: {
        metadata: {
          lastAttemptAt: success,
          lastSuccessAt: success,
          incident: { category: "network", consecutiveFailures: 2 },
        },
      },
    }),
  });
  const after = {
    ...before,
    startedAt: "2026-08-26T10:02:00.000Z",
    revision: "b".repeat(64),
    apps: {
      unavailable: app("unavailable", {
        status: "unavailable",
        units: {
          releases: {
            lastAttemptAt: attempt,
            lastSuccessAt: success,
            incident: { category: "not-found", consecutiveFailures: 3 },
          },
        },
      }),
      quarantined: app("quarantined", {
        status: "quarantined",
        units: {
          metadata: {
            lastAttemptAt: attempt,
            lastSuccessAt: success,
            incident: { category: "integrity", consecutiveFailures: 1 },
          },
        },
      }),
      persistent: app("persistent", {
        units: {
          metadata: {
            lastAttemptAt: attempt,
            lastSuccessAt: success,
            incident: { category: "network", consecutiveFailures: 3 },
          },
        },
      }),
    },
  } satisfies CapturedRefreshState;

  const report = createRefreshReport(before, after, network);

  assert.equal(report.catalogChanged, true);
  assert.equal(report.apps.attempted, 3);
  assert.equal(report.apps.failed, 3);
  assert.deepEqual(
    report.alerts.map(({ slug, kind }) => ({ slug, kind })),
    [
      { slug: "unavailable", kind: "unavailable" },
      { slug: "quarantined", kind: "quarantined" },
      { slug: "persistent", kind: "persistent-failure" },
    ]
  );
  assert.deepEqual(report.rateLimitedProviders, [
    { host: "api.example.org", blockedUntil: "2026-08-26T11:00:00.000Z" },
  ]);
});

test("refresh reports do not repeat alerts for existing incidents", () => {
  const existing = state({
    example: app("example", {
      status: "unavailable",
      units: {
        releases: {
          lastAttemptAt: success,
          lastSuccessAt: success,
          incident: { category: "not-found", consecutiveFailures: 3 },
        },
      },
    }),
  });

  const report = createRefreshReport(existing, existing, {
    durationMs: 0,
    requests: 0,
    bytes: 0,
    hosts: {},
  });

  assert.equal(report.alerts.length, 0);
  assert.equal(report.persistentFailures.length, 1);
});
