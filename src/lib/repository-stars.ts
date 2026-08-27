import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { readResponse, safeFetch } from "#catalog/http";
import { refreshStateSchema } from "#catalog/refresh";

const starsUrl = pathToFileURL(`${process.cwd()}/.generated/stars.json`);

export const repositoryStarsSchema = z
  .object({
    values: z.record(z.string(), z.number().int().nonnegative()),
    refresh: z.record(z.string(), refreshStateSchema),
  })
  .strict();

export const repositoryStarEtagsSchema = z.record(z.string(), z.string().min(1));

interface StarRequest {
  url: string;
  field: "star_count" | "stargazers_count" | "stars_count";
  headers?: Record<string, string>;
}

interface RepositoryStarResult {
  count?: number;
  etag?: string;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

let starsPromise: Promise<z.infer<typeof repositoryStarsSchema>> | undefined;

export class RepositoryRateLimitError extends Error {}

function rateLimitError(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  const resetHeader = response.headers.get("x-ratelimit-reset");
  const reset = resetHeader ? Number(resetHeader) : Number.NaN;
  let limit = "";

  if (retryAfter) {
    limit = `; retry after ${retryAfter} seconds`;
  } else if (Number.isFinite(reset)) {
    limit = `; rate limit resets at ${new Date(reset * 1000).toISOString()}`;
  }

  return new RepositoryRateLimitError(`${response.status} ${response.statusText}${limit}`);
}

export function repositoryStarRequest(
  repository: string,
  githubToken?: string,
  etag?: string
): StarRequest | null {
  const url = new URL(repository);
  const path = url.pathname.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").filter(Boolean);

  if (url.hostname === "github.com" && parts.length === 2) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    if (etag) {
      headers["If-None-Match"] = etag;
    }

    return {
      url: `https://api.github.com/repos/${parts[0]}/${parts[1]}`,
      field: "stargazers_count",
      headers,
    };
  }

  if (url.hostname === "gitlab.com" && parts.length >= 2) {
    return {
      url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`,
      field: "star_count",
      ...(etag ? { headers: { "If-None-Match": etag } } : {}),
    };
  }

  if (url.hostname === "codeberg.org" && parts.length === 2) {
    return {
      url: `https://codeberg.org/api/v1/repos/${parts[0]}/${parts[1]}`,
      field: "stars_count",
      ...(etag ? { headers: { "If-None-Match": etag } } : {}),
    };
  }

  return null;
}

export async function fetchRepositoryStars(
  repository: string,
  githubToken?: string,
  etag?: string,
  fetcher: Fetcher = fetch
): Promise<RepositoryStarResult | undefined> {
  const request = repositoryStarRequest(repository, githubToken, etag);

  if (!request) {
    return undefined;
  }

  const response = await safeFetch(
    request.url,
    request.headers ? { headers: request.headers } : {},
    fetcher
  );

  const responseEtag = response.headers.get("etag") ?? etag;

  if (response.status === 304) {
    return responseEtag ? { etag: responseEtag } : {};
  }

  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.has("retry-after") ||
        response.headers.get("x-ratelimit-remaining") === "0"))
  ) {
    throw rateLimitError(response);
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const data = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse((await readResponse(response, 1024 * 1024, request.url)).toString("utf8")));
  const count = z.number().int().nonnegative().parse(data[request.field]);

  return { count, ...(responseEtag ? { etag: responseEtag } : {}) };
}

async function loadRepositoryStars() {
  return repositoryStarsSchema.parse(JSON.parse(await readFile(starsUrl, "utf8")));
}

export function getRepositoryStarData() {
  return (starsPromise ??= loadRepositoryStars());
}

export async function getRepositoryStars() {
  return (await getRepositoryStarData()).values;
}
