import { readFile } from "node:fs/promises";
import { z } from "zod";

const reportPath = process.env.APPHUB_REFRESH_REPORT ?? "/tmp/apphub-refresh-report.json";
const issueTitle = "Catalog maintenance";
const issueMarker = "<!-- apphub-catalog-maintenance -->";

const problemSchema = z.discriminatedUnion("kind", [
  z.object({ slug: z.string(), kind: z.enum(["quarantined", "unavailable"]) }),
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
  }),
  maintenance: z.array(problemSchema),
});

type Report = z.infer<typeof reportSchema>;

function requiredEnvironment(name: string) {
  const value = process.env[name];

  if (!value) throw new Error(`${name} is required`);

  return value;
}

function problemLine(problem: z.infer<typeof problemSchema>) {
  if (problem.kind === "persistent-failure") {
    return `- \`${problem.slug}\`: ${problem.unit} ${problem.category} (${problem.consecutiveFailures} consecutive failures)`;
  }

  return `- \`${problem.slug}\`: ${problem.kind}`;
}

export function issueBody(report: Report, runUrl: string) {
  const visibleProblems = report.maintenance.slice(0, 100).map(problemLine);

  if (report.maintenance.length > visibleProblems.length) {
    visibleProblems.push(
      `- ${report.maintenance.length - visibleProblems.length} more in the workflow report`
    );
  }

  return [
    issueMarker,
    "The automated catalog refresh needs maintainer review.",
    "",
    ...visibleProblems,
    "",
    `Catalog status: ${report.apps.current} current, ${report.apps.stale} stale, ${report.apps.unavailable} unavailable, ${report.apps.quarantined} quarantined (${report.apps.total} total).`,
    "",
    "Automation keeps the last-known-good data and disables downloads when integrity or source identity is uncertain. Resolving this issue must go through a reviewed manifest change; this workflow never changes sources, provenance, ownership, or listings.",
    "",
    `Last checked: ${report.completedAt}`,
    `Workflow run: ${runUrl}`,
  ].join("\n");
}

function resolvedIssueBody(report: Report, runUrl: string) {
  return [
    issueMarker,
    "The automated catalog refresh has no actionable maintenance conditions.",
    "",
    `Last checked: ${report.completedAt}`,
    `Workflow run: ${runUrl}`,
  ].join("\n");
}

async function github(apiUrl: string, path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path}: ${response.status}`);
  }

  return response.status === 204 ? undefined : (response.json() as Promise<unknown>);
}

async function main() {
  const token = requiredEnvironment("GITHUB_TOKEN");
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  const apiUrl = requiredEnvironment("GITHUB_API_URL");
  const server = requiredEnvironment("GITHUB_SERVER_URL");
  const runId = requiredEnvironment("GITHUB_RUN_ID");
  const assignee = requiredEnvironment("APPHUB_MAINTENANCE_ASSIGNEE");
  const report = reportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
  const runUrl = `${server}/${repository}/actions/runs/${runId}`;
  const query = encodeURIComponent(`repo:${repository} is:issue in:title "${issueTitle}"`);
  const issues = z
    .object({
      items: z.array(
        z.object({
          number: z.number().int().positive(),
          state: z.enum(["open", "closed"]),
          title: z.string(),
          body: z.string().nullable(),
          pull_request: z.unknown().optional(),
        })
      ),
    })
    .parse(await github(apiUrl, `/search/issues?q=${query}&per_page=10`, token));
  const issue = issues.items.find(
    (candidate) =>
      !candidate.pull_request &&
      candidate.title === issueTitle &&
      candidate.body?.includes(issueMarker)
  );

  if (!report.maintenance.length) {
    if (issue?.state === "open") {
      await github(apiUrl, `/repos/${repository}/issues/${issue.number}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          body: resolvedIssueBody(report, runUrl),
          state: "closed",
          state_reason: "completed",
        }),
      });
    }

    return;
  }

  const body = issueBody(report, runUrl);

  if (issue) {
    await github(apiUrl, `/repos/${repository}/issues/${issue.number}`, token, {
      method: "PATCH",
      body: JSON.stringify({ assignees: [assignee], body, state: "open" }),
    });
  } else {
    await github(apiUrl, `/repos/${repository}/issues`, token, {
      method: "POST",
      body: JSON.stringify({ assignees: [assignee], title: issueTitle, body }),
    });
  }
}

if (import.meta.main) await main();
