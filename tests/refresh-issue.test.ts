import assert from "node:assert/strict";
import { test } from "node:test";
import { issueBody } from "#scripts/refresh-issue";

test("maintenance issues explain current problems and the safety boundary", () => {
  const body = issueBody(
    {
      completedAt: "2026-08-26T10:02:00.000Z",
      apps: { total: 2, current: 0, stale: 0, unavailable: 1, quarantined: 1 },
      maintenance: [
        { slug: "unsafe", kind: "quarantined" },
        {
          slug: "missing",
          kind: "persistent-failure",
          unit: "releases",
          category: "not-found",
          consecutiveFailures: 3,
        },
      ],
    },
    "https://github.com/example/apphub/actions/runs/1"
  );

  assert.match(body, /`unsafe`: quarantined/);
  assert.match(body, /`missing`: releases not-found \(3 consecutive failures\)/);
  assert.match(body, /last-known-good data/);
  assert.match(body, /never changes sources, provenance, ownership, or listings/);
});
