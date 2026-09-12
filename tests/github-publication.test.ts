import assert from "node:assert/strict";
import { test } from "node:test";
import { createGitHubPublication, maximumAssetsPerMediaRelease } from "#catalog/github-publication";

const snapshot = {
  revision: "f".repeat(64),
  generatedAt: "2026-09-12T10:00:00.000Z",
};

function asset(hash: string) {
  return { file: `${hash}.webp`, sha256: hash, size: 100 };
}

test("GitHub publication creates content-addressed immutable release batches", () => {
  const first = `00${"a".repeat(62)}`;
  const second = `ff${"b".repeat(62)}`;
  const publication = createGitHubPublication("example/assets", snapshot, [
    asset(second),
    asset(first),
  ]);

  assert.equal(publication.media.length, 1);
  assert.equal(publication.media[0]!.tag, "media-0001");
  assert.deepEqual(
    publication.media[0]!.assets.map(({ file }) => file),
    [`${first}.webp`, `${second}.webp`]
  );
  assert.equal(
    publication.media[0]!.assets[0]!.url,
    `https://github.com/example/assets/releases/download/${publication.media[0]!.tag}/${first}.webp`
  );
  assert.equal(publication.mapping.assets[`${first}.webp`]?.tag, publication.media[0]!.tag);
});

test("GitHub publication gives new release batches readable sequential tags", () => {
  const oldHash = "a".repeat(64);
  const publication = createGitHubPublication(
    "example/assets",
    snapshot,
    [asset(oldHash), asset("b".repeat(64))],
    {
      version: 1,
      assets: {
        [`${oldHash}.webp`]: { tag: `media-${"c".repeat(64)}`, sha256: oldHash, size: 100 },
      },
    }
  );

  assert.equal(publication.media[0]!.tag, "media-0002");
});

test("GitHub publication does not republish mapped media", () => {
  const hash = "a".repeat(64);
  const tag = `media-${"b".repeat(64)}`;
  const publication = createGitHubPublication("example/assets", snapshot, [asset(hash)], {
    version: 1,
    assets: { [`${hash}.webp`]: { tag, sha256: hash, size: 100 } },
  });

  assert.deepEqual(publication.media, []);
  assert.equal(publication.mapping.assets[`${hash}.webp`]?.tag, tag);
});

test("GitHub publication rejects media identity conflicts and duplicates", () => {
  const hash = "a".repeat(64);
  assert.throws(
    () =>
      createGitHubPublication("example/assets", snapshot, [
        { file: `${hash}.webp`, sha256: "b".repeat(64), size: 100 },
      ]),
    /filename does not match/
  );
  assert.throws(
    () => createGitHubPublication("example/assets", snapshot, [asset(hash), asset(hash)]),
    /duplicate media asset/
  );
});

test("GitHub publication keeps every immutable release below GitHub's asset limit", () => {
  const assets = Array.from({ length: maximumAssetsPerMediaRelease + 1 }, (_, index) =>
    asset(index.toString(16).padStart(64, "0"))
  );
  const publication = createGitHubPublication("example/assets", snapshot, assets);

  assert.equal(publication.media.length, 2);
  assert.ok(publication.media.every(({ assets }) => assets.length <= maximumAssetsPerMediaRelease));
});
