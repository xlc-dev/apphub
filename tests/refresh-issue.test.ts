import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import {
  issueBody,
  maintainCatalogIssue,
  stateFingerprint,
  type Report,
} from "#scripts/refresh/issue";

const originalFetch = globalThis.fetch;
const config = {
  apiUrl: "https://api.example.test",
  repository: "example/apphub",
  token: "token",
  assignee: "maintainer",
  runUrl: "https://example.test/run/1",
};

function report(maintenance: Report["maintenance"] = []): Report {
  return {
    completedAt: "2026-08-26T10:02:00.000Z",
    apps: { total: 2, current: 0, stale: 0, unavailable: 1, quarantined: 1 },
    maintenance,
  };
}

function response(value: unknown, status = 200) {
  return new Response(status === 204 ? undefined : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (path: string, init: RequestInit) => Response) {
  const calls: Array<{
    path: string;
    init: RequestInit;
    body: Record<string, unknown> | undefined;
  }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname + url.search;
    const body =
      typeof init.body === "string"
        ? z.record(z.string(), z.unknown()).parse(JSON.parse(init.body) as unknown)
        : undefined;
    calls.push({ path, init, body });
    if (path.includes("/labels?") && !init.method) {
      return response([{ name: "catalog-maintenance" }]);
    }
    return handler(path, init);
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("maintenance body is deterministic and explains the safety boundary", () => {
  const problems: Report["maintenance"] = [
    { slug: "unsafe", kind: "quarantined" },
    {
      slug: "missing",
      kind: "persistent-failure",
      unit: "releases",
      category: "not-found",
      consecutiveFailures: 3,
    },
  ];
  const body = issueBody(report(problems), config.runUrl);
  assert.match(body, /`unsafe`: quarantined/);
  assert.match(body, /`missing`: releases not-found \(3 consecutive failures\)/);
  assert.match(body, /last-known-good data/);
  assert.equal(stateFingerprint(problems), stateFingerprint([...problems].reverse()));
});

test("maintenance body stays below GitHub's practical size limit at 4,000 apps", () => {
  const maintenance = Array.from({ length: 4000 }, (_, index) => ({
    slug: `app-${String(index).padStart(4, "0")}`,
    kind: "quarantined" as const,
  }));
  const largeReport = report(maintenance);
  largeReport.apps.total = 4000;
  largeReport.apps.quarantined = 4000;

  assert.ok(Buffer.byteLength(issueBody(largeReport, config.runUrl)) < 50_000);
});

test("creates an assigned, labeled issue and ignores title collisions", async () => {
  const calls = mockFetch((_path, init) =>
    init.method === "POST"
      ? response({
          number: 8,
          state: "open",
          title: "Catalog maintenance",
          body: "",
          html_url: "https://example.test/8",
        })
      : response([{ number: 7, state: "open", title: "Catalog maintenance", body: "unrelated" }])
  );
  await maintainCatalogIssue(report([{ slug: "unsafe", kind: "quarantined" }]), config);
  const create = calls.find((call) => call.init.method === "POST");
  assert.ok(create?.body);
  assert.deepEqual(create.body.assignees, ["maintainer"]);
  assert.deepEqual(create.body.labels, ["catalog-maintenance"]);
});

test("updates silently when actionable state is unchanged", async () => {
  const current = report([{ slug: "unsafe", kind: "quarantined" }]);
  const calls = mockFetch((_path, init) =>
    init.method === "PATCH"
      ? response({})
      : response([
          {
            number: 3,
            state: "open",
            title: "Catalog maintenance",
            body: issueBody(current, "old"),
          },
        ])
  );
  await maintainCatalogIssue(current, config);
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
  assert.equal(calls.filter((call) => call.init.method === "PATCH").length, 1);
});

test("comments only on changed state and reopens the tracked issue", async () => {
  const old = report([{ slug: "missing", kind: "unavailable" }]);
  const next = report([
    { slug: "unsafe", kind: "quarantined" },
    {
      slug: "missing",
      kind: "persistent-failure",
      unit: "releases",
      category: "not-found",
      consecutiveFailures: 4,
    },
  ]);
  const calls = mockFetch((path, init) => {
    if (path.includes("/comments?") && !init.method) return response([]);
    if (init.method) return response({});
    return response([
      { number: 3, state: "closed", title: "Catalog maintenance", body: issueBody(old, "old") },
    ]);
  });
  await maintainCatalogIssue(next, config);
  const comment = calls.find(
    (call) => call.path.endsWith("/comments") && call.init.method === "POST"
  );
  const update = calls.find((call) => call.init.method === "PATCH");
  assert.match(String(comment?.body?.body), /New:/);
  assert.match(String(comment?.body?.body), /Recovered:/);
  assert.ok(update?.body);
  assert.equal(update.body.state, "open");
  assert.deepEqual(update.body.assignees, ["maintainer"]);
});

test("closes an issue and reports recovery", async () => {
  const old = report([{ slug: "missing", kind: "unavailable" }]);
  const calls = mockFetch((_path, init) =>
    init.method
      ? response({})
      : response([
          { number: 3, state: "open", title: "Catalog maintenance", body: issueBody(old, "old") },
        ])
  );
  await maintainCatalogIssue(report(), config);
  assert.match(
    String(calls.find((call) => call.path.endsWith("/comments"))?.body?.body),
    /Recovered:/
  );
  assert.equal(calls.find((call) => call.init.method === "PATCH")?.body?.state, "closed");
});

test("paginates issue lookup and rotates after 100 change comments", async () => {
  const old = report([{ slug: "old", kind: "unavailable" }]);
  const filler = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    state: "open",
    title: "Other",
    body: "",
  }));
  const comments = Array.from({ length: 100 }, () => ({ body: "<!-- apphub-catalog-change -->" }));
  const calls = mockFetch((path, init) => {
    const page = new URL(path, "https://api.example.test").searchParams.get("page");
    if (path.includes("issues?state=all") && page === "1") return response(filler);
    if (path.includes("issues?state=all"))
      return response([
        {
          number: 101,
          state: "open",
          title: "Catalog maintenance",
          body: issueBody(old, "old"),
          html_url: "https://example.test/101",
        },
      ]);
    if (path.includes("/comments?") && page === "1") return response(comments);
    if (path.includes("/comments?")) return response([]);
    if (path.endsWith("/issues") && init.method === "POST")
      return response({
        number: 102,
        state: "open",
        title: "Catalog maintenance",
        body: "",
        html_url: "https://example.test/102",
      });
    return response({});
  });
  await maintainCatalogIssue(report([{ slug: "new", kind: "revoked" }]), config);
  assert.equal(calls.filter((call) => call.path.includes("issues?state=all")).length, 2);
  assert.equal(calls.filter((call) => call.path.includes("/comments?")).length, 2);
  assert.equal(
    calls.find((call) => call.path.endsWith("/issues") && call.init.method === "POST")?.body?.title,
    "Catalog maintenance"
  );
  assert.match(
    String(
      calls.find((call) => call.path.endsWith("/comments") && call.init.method === "POST")?.body
        ?.body
    ),
    /102/
  );
});
