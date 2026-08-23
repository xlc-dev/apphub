import assert from "node:assert/strict";
import { test } from "node:test";
import { repositoryStarsSchema } from "#catalog/stars";
import { fetchRepositoryStars, repositoryStarRequest } from "#lib/repository-stars";

test("validates stored repository stars", () => {
  assert.deepEqual(repositoryStarsSchema.parse({ app: 42 }), { app: 42 });
  assert.throws(() => repositoryStarsSchema.parse({ app: -1 }));
});

async function rejectionMessage(promise: Promise<unknown>) {
  try {
    await promise;
    return "";
  } catch (error) {
    return String(error);
  }
}

test("builds requests for supported repository hosts", () => {
  assert.deepEqual(repositoryStarRequest("https://github.com/example/app.git", "token"), {
    url: "https://api.github.com/repos/example/app",
    field: "stargazers_count",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  assert.deepEqual(repositoryStarRequest("https://gitlab.com/example/tools/app"), {
    url: "https://gitlab.com/api/v4/projects/example%2Ftools%2Fapp",
    field: "star_count",
  });
  assert.deepEqual(repositoryStarRequest("https://codeberg.org/example/app"), {
    url: "https://codeberg.org/api/v1/repos/example/app",
    field: "stars_count",
  });
  assert.equal(repositoryStarRequest("https://example.org/example/app"), null);
});

test("reads a valid star count", async () => {
  const fetcher = () =>
    Promise.resolve(
      new Response(JSON.stringify({ star_count: 42 }), {
        headers: { "content-type": "application/json" },
      })
    );

  assert.equal(
    await fetchRepositoryStars("https://gitlab.com/example/app", undefined, fetcher),
    42
  );
});

test("rejects invalid and failed responses", async () => {
  const invalid = () => Promise.resolve(new Response(JSON.stringify({ stars_count: -1 })));
  const failed = () => Promise.resolve(new Response(null, { status: 503 }));

  assert.notEqual(
    await rejectionMessage(
      fetchRepositoryStars("https://codeberg.org/example/app", undefined, invalid)
    ),
    ""
  );
  assert.match(
    await rejectionMessage(
      fetchRepositoryStars("https://github.com/example/app", undefined, failed)
    ),
    /503/
  );
});
