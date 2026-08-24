import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl, readResponse, safeFetch } from "#catalog/http";
import { collectPages, getJson } from "#scripts/releases/http";

test("collects every page", async () => {
  const pages = [[1, 2], [3]];

  assert.deepEqual(
    await collectPages((page) => Promise.resolve(pages[page - 1] ?? []), 2),
    [1, 2, 3]
  );
});

test("limits pagination", async () => {
  await assert.rejects(
    collectPages(() => Promise.resolve([1, 2]), 2, 3),
    /more than 3 items/
  );
});

test("reports rate-limit reset times", async () => {
  const reset = 1_800_000_000;
  const fetcher = () =>
    Promise.resolve(
      new Response(null, {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(reset),
        },
      })
    );

  await assert.rejects(
    getJson("https://api.github.com/example", undefined, fetcher),
    new RegExp(new Date(reset * 1000).toISOString())
  );
});

test("rejects private remote addresses", async () => {
  await assert.rejects(
    assertPublicUrl(new URL("https://example.org/data"), async () => [{ address: "127.0.0.1" }]),
    /public addresses/
  );
});

test("validates redirect destinations and removes credentials", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetcher = (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    requests.push({ url, authorization: headers.get("authorization") });

    return Promise.resolve(
      requests.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example.net/data" },
          })
        : new Response("ok")
    );
  };

  const response = await safeFetch(
    "https://example.org/data",
    { headers: { Authorization: "Bearer secret" } },
    fetcher,
    async () => [{ address: "8.8.8.8" }]
  );

  assert.equal(await response.text(), "ok");
  assert.deepEqual(requests, [
    { url: "https://example.org/data", authorization: "Bearer secret" },
    { url: "https://cdn.example.net/data", authorization: null },
  ]);
});

test("limits response bodies", async () => {
  await assert.rejects(readResponse(new Response("12345"), 4, "fixture"), /too large/);
});
