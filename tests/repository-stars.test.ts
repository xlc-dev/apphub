import { expect, test } from "bun:test";
import { fetchRepositoryStars, repositoryStarRequest } from "@/lib/repository-stars";

async function rejectionMessage(promise: Promise<unknown>) {
  try {
    await promise;
    return "";
  } catch (error) {
    return String(error);
  }
}

test("builds requests for supported repository hosts", () => {
  expect(repositoryStarRequest("https://github.com/example/app.git", "token")).toEqual({
    url: "https://api.github.com/repos/example/app",
    field: "stargazers_count",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer token",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  expect(repositoryStarRequest("https://gitlab.com/example/tools/app")).toEqual({
    url: "https://gitlab.com/api/v4/projects/example%2Ftools%2Fapp",
    field: "star_count",
  });
  expect(repositoryStarRequest("https://codeberg.org/example/app")).toEqual({
    url: "https://codeberg.org/api/v1/repos/example/app",
    field: "stars_count",
  });
  expect(repositoryStarRequest("https://example.org/example/app")).toBeNull();
});

test("reads a valid star count", async () => {
  const fetcher = () =>
    Promise.resolve(
      new Response(JSON.stringify({ star_count: 42 }), {
        headers: { "content-type": "application/json" },
      })
    );

  expect(await fetchRepositoryStars("https://gitlab.com/example/app", undefined, fetcher)).toBe(
    42
  );
});

test("rejects invalid and failed responses", async () => {
  const invalid = () => Promise.resolve(new Response(JSON.stringify({ stars_count: -1 })));
  const failed = () => Promise.resolve(new Response(null, { status: 503 }));

  expect(
    await rejectionMessage(
      fetchRepositoryStars("https://codeberg.org/example/app", undefined, invalid)
    )
  ).not.toBe("");
  expect(
    await rejectionMessage(
      fetchRepositoryStars("https://github.com/example/app", undefined, failed)
    )
  ).toContain("503");
});
