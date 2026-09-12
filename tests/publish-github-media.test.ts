import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import { createGitHubPublication } from "#catalog/github-publication";
import { missingMediaAssets, publishGitHubMedia } from "#scripts/media/publish";

const originalFetch = globalThis.fetch;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

test("media publication uploads only missing assets", () => {
  const planned = [
    { file: `${"a".repeat(64)}.webp`, sha256: "a".repeat(64), size: 10 },
    { file: `${"b".repeat(64)}.webp`, sha256: "b".repeat(64), size: 20 },
  ];

  assert.deepEqual(
    missingMediaAssets(planned, [
      { name: planned[0]!.file, size: 10, digest: `sha256:${"a".repeat(64)}` },
    ]),
    [planned[1]]
  );
});

test("media publication rejects an existing content-address collision", () => {
  const file = `${"a".repeat(64)}.webp`;

  assert.throws(
    () =>
      missingMediaAssets(
        [{ file, sha256: "a".repeat(64), size: 10 }],
        [{ name: file, size: 11, digest: `sha256:${"a".repeat(64)}` }]
      ),
    /different size/
  );
});

test("media publication requires GitHub's matching content digest", () => {
  const sha256 = "a".repeat(64);
  const file = `${sha256}.webp`;

  assert.throws(
    () => missingMediaAssets([{ file, sha256, size: 10 }], [{ name: file, size: 10 }]),
    /no matching SHA-256 digest/
  );
  assert.throws(
    () =>
      missingMediaAssets(
        [{ file, sha256, size: 10 }],
        [{ name: file, size: 10, digest: `sha256:${"b".repeat(64)}` }]
      ),
    /no matching SHA-256 digest/
  );
});

test("a partial upload never publishes the media mapping", async () => {
  const directory = await mkdtemp(join(tmpdir(), "apphub-media-publication-"));
  temporaryDirectories.push(directory);
  const data = Buffer.from("media");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const file = `${sha256}.webp`;
  const publication = createGitHubPublication(
    "example/apphub",
    { revision: "f".repeat(64), generatedAt: "2026-09-12T00:00:00.000Z" },
    [{ file, sha256, size: data.length }]
  );
  const mapPath = pathToFileURL(`${directory}/media-map.json`);
  await writeFile(join(directory, file), data);

  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/immutable-releases"))
      return Promise.resolve(Response.json({ enabled: true }));
    if (url.includes("/releases/tags/"))
      return Promise.resolve(new Response(null, { status: 404 }));
    if (url.endsWith("/releases") && init?.method === "POST") {
      return Promise.resolve(
        Response.json({
          id: 1,
          upload_url: "https://uploads.example/assets{?name,label}",
          draft: true,
        })
      );
    }
    if (url.includes("/releases/1/assets")) return Promise.resolve(Response.json([]));
    if (url.startsWith("https://uploads.example/")) {
      return Promise.resolve(new Response(null, { status: 500 }));
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  };

  await assert.rejects(
    publishGitHubMedia(
      publication,
      pathToFileURL(`${directory}/`),
      {
        apiUrl: "https://api.example",
        repository: "example/apphub",
        token: "test",
      },
      mapPath
    ),
    /GitHub upload/
  );
  await assert.rejects(readFile(mapPath), /ENOENT/);
});

test("media mapping is written only after the complete draft is published", async () => {
  const directory = await mkdtemp(join(tmpdir(), "apphub-media-publication-"));
  temporaryDirectories.push(directory);
  const data = Buffer.from("media");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const file = `${sha256}.webp`;
  const publication = createGitHubPublication(
    "example/apphub",
    { revision: "f".repeat(64), generatedAt: "2026-09-12T00:00:00.000Z" },
    [{ file, sha256, size: data.length }]
  );
  const mapPath = pathToFileURL(`${directory}/media-map.json`);
  await writeFile(join(directory, file), data);
  let uploaded = false;
  let published = false;

  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/immutable-releases"))
      return Promise.resolve(Response.json({ enabled: true }));
    if (url.includes("/releases/tags/"))
      return Promise.resolve(new Response(null, { status: 404 }));
    if (url.endsWith("/releases") && init?.method === "POST") {
      return Promise.resolve(
        Response.json({
          id: 1,
          upload_url: "https://uploads.example/assets{?name,label}",
          draft: true,
        })
      );
    }
    if (url.includes("/releases/1/assets")) {
      return Promise.resolve(
        Response.json(
          uploaded ? [{ name: file, size: data.length, digest: `sha256:${sha256}` }] : []
        )
      );
    }
    if (url.startsWith("https://uploads.example/")) {
      uploaded = true;
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    if (url.endsWith("/releases/1") && init?.method === "PATCH") {
      published = true;
      return Promise.resolve(Response.json({}));
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  };

  assert.equal(
    await publishGitHubMedia(
      publication,
      pathToFileURL(`${directory}/`),
      { apiUrl: "https://api.example", repository: "example/apphub", token: "test" },
      mapPath
    ),
    1
  );
  assert.equal(published, true);
  assert.deepEqual(JSON.parse(await readFile(mapPath, "utf8")), publication.mapping);
});
