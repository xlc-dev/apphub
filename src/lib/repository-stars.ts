import { readFile } from "node:fs/promises";
import { z } from "zod";

interface StarRequest {
  url: string;
  field: "star_count" | "stargazers_count" | "stars_count";
  headers?: Record<string, string>;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const starMapSchema = z.record(z.string(), z.number().int().nonnegative());
let starsPromise: Promise<Record<string, number>> | undefined;

export function repositoryStarRequest(
  repository: string,
  githubToken?: string
): StarRequest | null {
  const url = new URL(repository);
  const path = url.pathname.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").filter(Boolean);

  if (url.hostname === "github.com" && parts.length === 2) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

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
    };
  }

  if (url.hostname === "codeberg.org" && parts.length === 2) {
    return {
      url: `https://codeberg.org/api/v1/repos/${parts[0]}/${parts[1]}`,
      field: "stars_count",
    };
  }

  return null;
}

export async function fetchRepositoryStars(
  repository: string,
  githubToken?: string,
  fetcher: Fetcher = fetch
) {
  const request = repositoryStarRequest(repository, githubToken);

  if (!request) return undefined;

  const response = await fetcher(
    request.url,
    request.headers ? { headers: request.headers } : undefined
  );

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const data = z.record(z.string(), z.unknown()).parse(await response.json());
  return z.number().int().nonnegative().parse(data[request.field]);
}

async function loadRepositoryStars(): Promise<Record<string, number>> {
  try {
    return starMapSchema.parse(
      JSON.parse(await readFile(`${process.cwd()}/.cache/repository-stars.json`, "utf8"))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function getRepositoryStars(): Promise<Record<string, number>> {
  return (starsPromise ??= loadRepositoryStars());
}
