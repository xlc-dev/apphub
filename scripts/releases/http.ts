import { z } from "zod";

export async function getJson(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    ...(headers ? { headers } : {}),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${url}: returned ${response.status}`);
  }

  return response.json();
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
