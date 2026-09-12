import assert from "node:assert/strict";
import { test } from "node:test";
import { readApps } from "#catalog/storage";
import { createTrustedCatalog } from "#catalog/tuf/catalog";

const now = new Date("2026-09-07T00:00:00.000Z");
const snapshot = { revision: "f".repeat(64), generatedAt: now.toISOString() };
const inspection = {
  format: "appimage" as const,
  runtimeType: 2 as const,
  elfClass: 64 as const,
  elfMachine: 62,
  archive: {
    format: "squashfs" as const,
    offset: 128,
    bytesUsed: 96,
    inodes: 1,
    blockSize: 4096,
  },
};
const entries = readApps();

async function fixture() {
  const source = (await entries).find(({ slug }) => slug === "warp")!;
  const entry = JSON.parse(JSON.stringify(source)) as typeof source;
  for (const artifact of entry.lock.releases[0]!.artifacts) {
    artifact.inspection = {
      ...inspection,
      elfClass: artifact.architecture === "x86_64" ? 64 : 64,
      elfMachine: artifact.architecture === "x86_64" ? 62 : 183,
    };
  }
  return entry;
}

function state(category?: "integrity" | "not-found", failures = 1) {
  return {
    lastAttemptAt: now.toISOString(),
    lastSuccessAt: now.toISOString(),
    ...(category ? { incident: { category, consecutiveFailures: failures } } : {}),
  };
}

function result(entry: Awaited<ReturnType<typeof fixture>>, revoked = new Set<string>()) {
  return createTrustedCatalog([entry], snapshot, now, revoked).apps[0]!;
}

test(
  "signed catalog enables inspected releases from reviewed manifests",
  { timeout: 30_000 },
  async () => {
    const entry = await fixture();
    const trusted = result(entry);
    assert.equal(trusted.status, "current");
    assert.ok(trusted.release?.artifacts.every(({ installable }) => installable));

    const ordinaryUpdate = JSON.parse(JSON.stringify(entry)) as typeof entry;
    ordinaryUpdate.lock.releases[0]!.version = "new-version";
    ordinaryUpdate.lock.releases[0]!.artifacts[0]!.sha256 = "a".repeat(64);
    assert.equal(result(ordinaryUpdate).release?.artifacts[0]?.installable, true);

    const uninspected = JSON.parse(JSON.stringify(entry)) as typeof entry;
    delete uninspected.lock.releases[0]!.artifacts[0]!.inspection;
    assert.equal(result(uninspected).status, "current");
    assert.equal(result(uninspected).release?.artifacts[0]?.installable, false);
  }
);

test(
  "signed catalog disables quarantined, unavailable, and revoked artifacts",
  { timeout: 30_000 },
  async () => {
    const entry = await fixture();
    entry.app.provenance.refresh.releases = state("integrity");
    let trusted = result(entry);
    assert.equal(trusted.status, "quarantined");
    assert.ok(trusted.release?.artifacts.every(({ installable }) => !installable));

    entry.app.provenance.refresh.releases = state("not-found", 3);
    trusted = result(entry);
    assert.equal(trusted.status, "unavailable");
    assert.ok(trusted.release?.artifacts.every(({ installable }) => !installable));

    entry.app.provenance.refresh.releases = state();
    const revoked = entry.lock.releases[0]!.artifacts[0]!.sha256;
    trusted = result(entry, new Set([revoked]));
    assert.equal(trusted.status, "revoked");
    assert.ok(trusted.release?.artifacts.every(({ installable }) => !installable));
  }
);
