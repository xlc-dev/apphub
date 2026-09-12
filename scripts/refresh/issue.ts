import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";

const reportPath = process.env.APPHUB_REFRESH_REPORT ?? "/tmp/apphub-refresh-report.json";
const issueTitle = "Catalog maintenance";
const issueMarker = "<!-- apphub-catalog-maintenance -->";
const stateMarker = "apphub-catalog-state:";
const changeMarker = "<!-- apphub-catalog-change -->";
const issueLabel = "catalog-maintenance";
const pageSize = 100;

const problemSchema = z.discriminatedUnion("kind", [
  z.object({
    slug: z.string(),
    kind: z.enum(["quarantined", "unavailable", "revoked"]),
  }),
  z.object({
    slug: z.string(),
    kind: z.literal("persistent-failure"),
    unit: z.enum(["metadata", "releases", "downloads", "stars"]),
    category: z.enum(["network", "rate-limit", "not-found", "invalid-data", "integrity"]),
    consecutiveFailures: z.number().int().positive(),
  }),
]);
const reportSchema = z.object({
  completedAt: z.iso.datetime(),
  apps: z.object({
    total: z.number().int().nonnegative(),
    current: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    revoked: z.number().int().nonnegative().optional(),
  }),
  maintenance: z.array(problemSchema),
});
const issueSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string().optional(),
  pull_request: z.unknown().optional(),
});
const commentSchema = z.object({ body: z.string().nullable() });
const labelSchema = z.object({ name: z.string() });
const savedStateSchema = z.object({ fingerprint: z.string(), maintenance: z.array(problemSchema) });

export type Report = z.infer<typeof reportSchema>;
type Problem = z.infer<typeof problemSchema>;
type Issue = z.infer<typeof issueSchema>;
interface Config {
  apiUrl: string;
  repository: string;
  token: string;
  assignee: string;
  runUrl: string;
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function problemKey(problem: Problem) {
  return problem.kind === "persistent-failure"
    ? `${problem.slug}:${problem.kind}:${problem.unit}`
    : `${problem.slug}:${problem.kind}`;
}

function sortedProblems(problems: Problem[]) {
  return [...problems].sort((a, b) => problemKey(a).localeCompare(problemKey(b)));
}

export function stateFingerprint(problems: Problem[]) {
  return createHash("sha256")
    .update(JSON.stringify(sortedProblems(problems)))
    .digest("hex");
}

function encodedState(report: Report) {
  const state = {
    fingerprint: stateFingerprint(report.maintenance),
    maintenance: sortedProblems(report.maintenance),
  };
  return `<!-- ${stateMarker}${deflateRawSync(JSON.stringify(state)).toString("base64url")} -->`;
}

function savedState(body: string | null) {
  const encoded = body?.match(new RegExp(`<!-- ${stateMarker}([A-Za-z0-9_-]+) -->`))?.[1];
  if (!encoded) return;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    try {
      return savedStateSchema.parse(JSON.parse(inflateRawSync(bytes).toString()));
    } catch {
      return savedStateSchema.parse(JSON.parse(bytes.toString()));
    }
  } catch {
    // Old or manually edited issues have no usable saved state.
  }
}

function problemLine(problem: Problem) {
  if (problem.kind === "persistent-failure") {
    return `- \`${problem.slug}\`: ${problem.unit} ${problem.category} (${problem.consecutiveFailures} consecutive failures)`;
  }
  return `- \`${problem.slug}\`: ${problem.kind}`;
}

export function issueBody(report: Report, runUrl: string, predecessor?: string) {
  const visible = sortedProblems(report.maintenance).slice(0, 100).map(problemLine);
  if (report.maintenance.length > visible.length) {
    visible.push(`- ${report.maintenance.length - visible.length} more in the workflow report`);
  }
  return [
    issueMarker,
    encodedState(report),
    "The automated catalog refresh needs maintainer review.",
    ...(predecessor ? ["", `Previous maintenance issue: ${predecessor}`] : []),
    "",
    ...visible,
    "",
    `Catalog status: ${report.apps.current} current, ${report.apps.stale} stale, ${report.apps.unavailable} unavailable, ${report.apps.quarantined} quarantined, ${report.apps.revoked ?? 0} revoked (${report.apps.total} total).`,
    "",
    "Automation keeps the last-known-good data and disables downloads when integrity or source identity is uncertain. Resolving this issue must go through a reviewed manifest change; this workflow never changes sources, provenance, ownership, or listings.",
    "",
    `Last checked: ${report.completedAt}`,
    `Workflow run: ${runUrl}`,
  ].join("\n");
}

function changeBody(previous: Problem[], current: Problem[], runUrl: string) {
  const old = new Map(previous.map((problem) => [problemKey(problem), problem]));
  const next = new Map(current.map((problem) => [problemKey(problem), problem]));
  const lines = [changeMarker, "Catalog maintenance state changed."];
  const added = [...next].filter(([key]) => !old.has(key)).map(([, value]) => problemLine(value));
  const recovered = [...old]
    .filter(([key]) => !next.has(key))
    .map(([, value]) => `- \`${value.slug}\`: recovered from ${value.kind}`);
  const escalated = [...next].flatMap(([key, value]) => {
    const prior = old.get(key);
    return prior && JSON.stringify(prior) !== JSON.stringify(value)
      ? [`- \`${value.slug}\`: escalated to ${problemLine(value).slice(2)}`]
      : [];
  });
  if (added.length) lines.push("", "New:", ...added);
  if (recovered.length) lines.push("", "Recovered:", ...recovered);
  if (escalated.length) lines.push("", "Escalated:", ...escalated);
  lines.push("", `Workflow run: ${runUrl}`);
  return lines.join("\n");
}

async function request(config: Config, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok)
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path}: ${response.status}`);
  if (response.status === 204) return;

  const value: unknown = await response.json();
  return value;
}

async function pages<T>(config: Config, path: string, schema: z.ZodType<T>) {
  const values: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = z
      .array(schema)
      .parse(await request(config, `${path}${separator}per_page=${pageSize}&page=${page}`));
    values.push(...batch);
    if (batch.length < pageSize) return values;
  }
}

async function createIssue(config: Config, report: Report, predecessor?: Issue) {
  return issueSchema.parse(
    await request(config, `/repos/${config.repository}/issues`, {
      method: "POST",
      body: JSON.stringify({
        assignees: [config.assignee],
        labels: [issueLabel],
        title: issueTitle,
        body: issueBody(report, config.runUrl, predecessor?.html_url),
      }),
    })
  );
}

export async function maintainCatalogIssue(reportValue: unknown, config: Config) {
  const report = reportSchema.parse(reportValue);
  const labels = await pages(config, `/repos/${config.repository}/labels`, labelSchema);

  if (!labels.some(({ name }) => name === issueLabel)) {
    await request(config, `/repos/${config.repository}/labels`, {
      method: "POST",
      body: JSON.stringify({
        name: issueLabel,
        color: "b60205",
        description: "Automated actionable catalog maintenance state",
      }),
    });
  }

  const issues = await pages(
    config,
    `/repos/${config.repository}/issues?state=all&labels=${issueLabel}`,
    issueSchema
  );
  const issue = issues.find(
    (candidate) =>
      !candidate.pull_request &&
      candidate.title === issueTitle &&
      candidate.body?.includes(issueMarker)
  );
  if (!issue) {
    if (report.maintenance.length) await createIssue(config, report);
    return;
  }

  const previous = savedState(issue.body);
  const changed = previous?.fingerprint !== stateFingerprint(report.maintenance);
  if (!report.maintenance.length) {
    if (issue.state === "open") {
      if (changed && previous)
        await request(config, `/repos/${config.repository}/issues/${issue.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: changeBody(previous.maintenance, [], config.runUrl) }),
        });
      await request(config, `/repos/${config.repository}/issues/${issue.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
    }
    return;
  }

  if (changed && previous) {
    const comments = await pages(
      config,
      `/repos/${config.repository}/issues/${issue.number}/comments`,
      commentSchema
    );
    if (comments.filter((comment) => comment.body?.includes(changeMarker)).length >= 100) {
      const successor = await createIssue(config, report, issue);
      await request(config, `/repos/${config.repository}/issues/${issue.number}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body: `${changeMarker}\nMaintenance continues in ${successor.html_url ?? `#${successor.number}`}.`,
        }),
      });
      await request(config, `/repos/${config.repository}/issues/${issue.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
      return;
    }
    await request(config, `/repos/${config.repository}/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: changeBody(previous.maintenance, report.maintenance, config.runUrl),
      }),
    });
  }

  await request(config, `/repos/${config.repository}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({
      assignees: [config.assignee],
      body: issueBody(report, config.runUrl),
      state: "open",
    }),
  });
}

async function main() {
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const server = requiredEnvironment("GITHUB_SERVER_URL");
  const runId = requiredEnvironment("GITHUB_RUN_ID");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as unknown;

  await maintainCatalogIssue(report, {
    apiUrl: requiredEnvironment("GITHUB_API_URL"),
    repository,
    token: requiredEnvironment("GITHUB_TOKEN"),
    assignee: requiredEnvironment("APPHUB_MAINTENANCE_ASSIGNEE"),
    runUrl: `${server}/${repository}/actions/runs/${runId}`,
  });
}

if (import.meta.main) await main();
