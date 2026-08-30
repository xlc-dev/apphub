import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl, pinnedLookup, readResponse, safeFetch } from "#catalog/http";
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
  await assert.rejects(
    assertPublicUrl(new URL("https://[::ffff:7f00:1]/data")),
    /public addresses/
  );
  await assert.rejects(
    assertPublicUrl(new URL("https://example.org/data"), async () => [
      { address: "64:ff9b::7f00:1" },
    ]),
    /public addresses/
  );
});

test("accepts public IPv4 addresses behind NAT64", async () => {
  assert.deepEqual(
    await assertPublicUrl(new URL("https://example.org/data"), async () => [
      { address: "64:ff9b::808:808" },
    ]),
    [{ address: "64:ff9b::808:808", family: 6 }]
  );
});

test("pins connections to the validated DNS result", async () => {
  let rebound = false;
  const addresses = await assertPublicUrl(new URL("https://example.org/data"), async () => [
    { address: rebound ? "127.0.0.1" : "8.8.8.8" },
  ]);

  rebound = true;

  const resolved = await new Promise<unknown>((resolve, reject) => {
    pinnedLookup(addresses)("example.org", { all: true }, (error, result) =>
      error ? reject(error) : resolve(result)
    );
  });

  assert.deepEqual(resolved, [{ address: "8.8.8.8", family: 4 }]);
});

test("validates redirect destinations and clears cross-origin headers", async () => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetcher = (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    requests.push({ url, headers: Object.fromEntries(headers) });

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
    { headers: { Accept: "application/json", Authorization: "Bearer secret", "X-Api-Key": "key" } },
    fetcher,
    async () => [{ address: "8.8.8.8" }]
  );

  assert.equal(await response.text(), "ok");
  assert.deepEqual(requests, [
    {
      url: "https://example.org/data",
      headers: {
        accept: "application/json",
        authorization: "Bearer secret",
        "x-api-key": "key",
      },
    },
    { url: "https://cdn.example.net/data", headers: {} },
  ]);
});

test("rejects hostile redirects", async () => {
  const missingLocation = () => Promise.resolve(new Response(null, { status: 302 }));
  const privateRedirect = () =>
    Promise.resolve(
      new Response(null, { status: 302, headers: { location: "https://internal.example/data" } })
    );
  const loop = () =>
    Promise.resolve(
      new Response(null, { status: 302, headers: { location: "https://example.org/data" } })
    );
  const resolver = async (hostname: string) => [
    { address: hostname === "internal.example" ? "127.0.0.1" : "8.8.8.8" },
  ];

  await assert.rejects(safeFetch("https://example.org/data", {}, missingLocation), /location/);
  await assert.rejects(
    safeFetch("https://example.org/data", {}, privateRedirect, resolver),
    /public addresses/
  );
  await assert.rejects(safeFetch("https://example.org/data", {}, loop), /too many redirects/);
});

test("limits response bodies", async () => {
  await assert.rejects(readResponse(new Response("12345"), 4, "fixture"), /too large/);
});
