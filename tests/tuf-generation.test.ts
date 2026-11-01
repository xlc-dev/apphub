import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { readCatalogSnapshot } from "#catalog/snapshot";
import { readApps } from "#catalog/storage";
import { createTrustedCatalog } from "#catalog/tuf/catalog";
import { createTufMetadata } from "#catalog/tuf/generation";
import {
  hashTarget,
  signTuf,
  tufKeyFromPrivate,
  tufRootSchema,
  verifyTarget,
  verifyTufRole,
} from "#catalog/tuf/metadata";
import { readRevokedHashes } from "#catalog/tuf/revocations";

function privateKey() {
  return generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
}

function createKeys() {
  return {
    root: privateKey(),
    targets: privateKey(),
    snapshot: privateKey(),
    timestamp: privateKey(),
    revocations: privateKey(),
  };
}

function createRoot(keys: ReturnType<typeof createKeys>) {
  const publicKeys = Object.values(keys).map(tufKeyFromPrivate);
  const role = (name: keyof typeof keys) => {
    const key = tufKeyFromPrivate(keys[name]);
    return { keyids: [key.keyid], threshold: 1 };
  };

  return tufRootSchema.parse({
    _type: "root",
    spec_version: "1.0.31",
    version: 1,
    expires: "2030-01-01T00:00:00.000Z",
    consistent_snapshot: true,
    keys: Object.fromEntries(publicKeys.map((key) => [key.keyid, key.value])),
    roles: {
      root: role("root"),
      targets: role("targets"),
      snapshot: role("snapshot"),
      timestamp: role("timestamp"),
      revocations: role("revocations"),
    },
  });
}

test(
  "generated TUF metadata authenticates the complete catalog chain",
  { timeout: 30_000 },
  async () => {
    const keys = createKeys();
    const root = createRoot(keys);
    const now = new Date("2026-09-12T12:00:00.000Z");
    const metadata = await createTufMetadata(
      signTuf(root, keys.root),
      { targets: keys.targets, snapshot: keys.snapshot, timestamp: keys.timestamp },
      {},
      now
    );

    verifyTufRole(root, "timestamp", metadata.timestamp, { now });
    verifyTufRole(root, "snapshot", metadata.snapshot, { now });
    verifyTufRole(root, "targets", metadata.targets, { now });

    const catalogBytes = Buffer.from(`${JSON.stringify(metadata.catalog, null, 2)}\n`);
    verifyTarget(catalogBytes, metadata.targets.signed.targets["catalog.json"]!);
    assert.ok(metadata.catalog.apps.length > 0);
    assert.ok(
      metadata.catalog.apps.every((app) =>
        app.release?.artifacts.every(
          (item) => !item.installable || app.status === "current" || app.status === "stale"
        )
      )
    );
    assert.deepEqual(hashTarget(catalogBytes), metadata.targets.signed.targets["catalog.json"]);
  }
);

test(
  "catalog status follows the snapshot time rather than the signing time",
  { timeout: 30_000 },
  async () => {
    const keys = createKeys();
    const root = createRoot(keys);
    const metadata = await createTufMetadata(
      signTuf(root, keys.root),
      { targets: keys.targets, snapshot: keys.snapshot, timestamp: keys.timestamp },
      {},
      new Date()
    );
    const expected = createTrustedCatalog(
      await readApps(),
      await readCatalogSnapshot(),
      undefined,
      await readRevokedHashes()
    );

    assert.deepEqual(metadata.catalog, expected);
  }
);
