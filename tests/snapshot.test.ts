import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { calculateCatalogRevision } from "#catalog/snapshot";
import { writeCatalogSnapshot } from "#scripts/write-snapshot";

async function fixture() {
  const path = await mkdtemp(`${tmpdir()}/apphub-snapshot-`);
  const root = pathToFileURL(`${path}/`);

  await mkdir(new URL("apps/", root), { recursive: true });
  await mkdir(new URL(".generated/apps/example/", root), { recursive: true });
  await mkdir(new URL(".generated/media/", root), { recursive: true });
  await writeFile(new URL("apps/example.json", root), '{"id":"example"}\n');
  await writeFile(
    new URL(".generated/apps/example/provenance.json", root),
    '{"source":"example","validator":{"etag":"one"}}\n'
  );
  await writeFile(new URL(".generated/media/example.webp", root), "image");
  await writeFile(new URL(".generated/downloads.json", root), '{"snapshots":[]}\n');
  await writeFile(new URL(".generated/stars.json", root), '{"values":{}}\n');

  return { path, root };
}

test("catalog revisions ignore formatting and refresh validators", async () => {
  const { path, root } = await fixture();

  try {
    const revision = await calculateCatalogRevision(root);

    await writeFile(new URL("apps/example.json", root), '{\n  "id": "example"\n}\n');
    await writeFile(
      new URL(".generated/apps/example/provenance.json", root),
      '{"validator":{"etag":"two"},"source":"example"}\n'
    );

    assert.equal(await calculateCatalogRevision(root), revision);

    await writeFile(new URL("apps/example.json", root), '{"id":"changed"}\n');
    assert.notEqual(await calculateCatalogRevision(root), revision);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("catalog generation time changes only with catalog state", async () => {
  const { path, root } = await fixture();

  try {
    const first = await writeCatalogSnapshot(new Date("2026-08-26T10:00:00.000Z"), root);
    const unchanged = await writeCatalogSnapshot(new Date("2026-08-27T10:00:00.000Z"), root);

    assert.deepEqual(unchanged, first);

    await writeFile(new URL(".generated/stars.json", root), '{"values":{"example":1}}\n');

    const changed = await writeCatalogSnapshot(new Date("2026-08-27T10:00:00.000Z"), root);
    const stored = JSON.parse(
      await readFile(new URL(".generated/snapshot.json", root), "utf8")
    ) as unknown;

    assert.notEqual(changed.revision, first.revision);
    assert.equal(changed.generatedAt, "2026-08-27T10:00:00.000Z");
    assert.deepEqual(stored, changed);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});
