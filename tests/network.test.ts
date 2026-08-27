import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { safeFetch } from "#catalog/http";
import { ProviderRateLimitError, scheduleRequest } from "#catalog/network";
import { getJsonConditional } from "#scripts/releases/http";

describe("refresh HTTP", () => {
  test("sends saved validators and accepts an unchanged response", async () => {
    const validator = { etag: '"revision"', lastModified: "Wed, 26 Aug 2026 10:00:00 GMT" };
    let headers = new Headers();

    const result = await getJsonConditional(
      "https://conditional.example/releases.json",
      undefined,
      validator,
      async (_url, init) => {
        headers = new Headers(init?.headers);

        return new Response(null, { status: 304 });
      }
    );

    assert.equal(headers.get("if-none-match"), validator.etag);
    assert.equal(headers.get("if-modified-since"), validator.lastModified);
    assert.deepEqual(result, { notModified: true, validator });
  });

  test("limits requests to one host", async () => {
    let active = 0;
    let maximum = 0;

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        safeFetch(`https://bounded.example/${index}`, {}, async () => {
          active++;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;

          return new Response("ok");
        })
      )
    );

    assert.equal(maximum, 3);
  });

  test("isolates an exhausted provider", async () => {
    const limited = new URL("https://limited.example/data");
    let repeated = false;

    await scheduleRequest(
      limited,
      async () => new Response(null, { status: 429, headers: { "Retry-After": "60" } })
    );

    await assert.rejects(
      scheduleRequest(limited, async () => {
        repeated = true;

        return new Response("unexpected");
      }),
      ProviderRateLimitError
    );

    const unrelated = await scheduleRequest(
      new URL("https://available.example/data"),
      async () => new Response("ok")
    );

    assert.equal(repeated, false);
    assert.equal(unrelated.status, 200);
  });
});
