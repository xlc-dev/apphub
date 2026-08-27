import type { z } from "zod";
import { conditionalHeaders, readResponse, responseValidator, safeFetch } from "#catalog/http";
import type { HttpValidator } from "#catalog/refresh";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function responseError(url: string, response: Response) {
  const retryAfter = response.headers.get("retry-after");
  const resetHeader = response.headers.get("x-ratelimit-reset");
  const reset = resetHeader ? Number(resetHeader) : Number.NaN;
  let limit = "";

  if (retryAfter) {
    limit = `; retry after ${retryAfter} seconds`;
  } else if (response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset)) {
    limit = `; rate limit resets at ${new Date(reset * 1000).toISOString()}`;
  }

  return new Error(`${url}: returned ${response.status}${limit}`);
}

export async function getJson(
  url: string,
  headers?: Record<string, string>,
  fetcher: Fetcher = fetch
) {
  const result = await getJsonConditional(url, headers, undefined, fetcher);

  if (result.notModified) throw new Error(`${url}: unexpected 304 response`);

  return result.value;
}

export async function getJsonConditional(
  url: string,
  headers?: Record<string, string>,
  validator?: HttpValidator,
  fetcher: Fetcher = fetch
) {
  const response = await safeFetch(
    url,
    {
      headers: { ...headers, ...conditionalHeaders(validator) },
      signal: AbortSignal.timeout(30_000),
    },
    fetcher
  );

  if (response.status === 304) {
    if (!validator) throw new Error(`${url}: returned 304 without a cached validator`);

    return { notModified: true as const, validator };
  }

  if (!response.ok) {
    throw responseError(url, response);
  }

  const value: unknown = JSON.parse(
    (await readResponse(response, 2 * 1024 * 1024, url)).toString("utf8")
  );

  return {
    notModified: false as const,
    value,
    validator: responseValidator(response),
  };
}

export async function collectPages<T>(
  fetchPage: (page: number) => Promise<T[]>,
  pageSize: number,
  maxItems = 1_000
) {
  const items: T[] = [];

  for (let page = 1; ; page++) {
    const batch = await fetchPage(page);

    items.push(...batch);

    if (items.length > maxItems) {
      throw new Error(`Release source returned more than ${maxItems} items`);
    }

    if (batch.length < pageSize) {
      return items;
    }
  }
}

export function getPages<T>(
  schema: z.ZodType<T[]>,
  pageUrl: (page: number) => string,
  pageSize: number,
  headers?: Record<string, string>
) {
  return collectPages(
    async (page) => schema.parse(await getJson(pageUrl(page), headers)),
    pageSize
  );
}
