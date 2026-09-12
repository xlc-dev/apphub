import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { signedEnvelopeSchema, signTuf, tufKeyFromPrivate } from "#catalog/tuf/metadata";
import { readRevokedHashes } from "#catalog/tuf/revocations";

function privateKey() {
  return generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
}

async function fixture(expires = "2030-01-01T00:00:00.000Z") {
  const directory = await mkdtemp(join(tmpdir(), "apphub-revocations-"));
  const rootPrivate = privateKey();
  const revocationsPrivate = privateKey();
  const rootKey = tufKeyFromPrivate(rootPrivate);
  const revocationsKey = tufKeyFromPrivate(revocationsPrivate);
  const unusedRole = { keyids: [rootKey.keyid], threshold: 1 };
  const root = {
    _type: "root",
    spec_version: "1.0.31",
    version: 1,
    expires: "2030-01-01T00:00:00.000Z",
    consistent_snapshot: true,
    keys: { [rootKey.keyid]: rootKey.value, [revocationsKey.keyid]: revocationsKey.value },
    roles: {
      root: unusedRole,
      targets: unusedRole,
      snapshot: unusedRole,
      timestamp: unusedRole,
      revocations: { keyids: [revocationsKey.keyid], threshold: 1 },
    },
  } as const;
  const revoked = "a".repeat(64);
  const revocations = {
    _type: "revocations",
    spec_version: "1.0.31",
    version: 1,
    expires,
    revoked: [{ sha256: revoked, revokedAt: "2026-09-12T00:00:00.000Z", reason: "test" }],
  } as const;

  await writeFile(join(directory, "root.json"), JSON.stringify(signTuf(root, rootPrivate)));
  await writeFile(
    join(directory, "revocations.json"),
    JSON.stringify(signTuf(revocations, revocationsPrivate))
  );

  return { directory, revoked };
}

test("reads only hashes from a signed, current revocation document", async () => {
  const { directory, revoked } = await fixture();
  try {
    assert.deepEqual(
      [...(await readRevokedHashes(pathToFileURL(`${directory}/`), new Date("2026-09-12")))],
      [revoked]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects expired and modified revocation documents", async () => {
  const expired = await fixture("2026-09-11T00:00:00.000Z");
  try {
    await assert.rejects(
      readRevokedHashes(pathToFileURL(`${expired.directory}/`), new Date("2026-09-12")),
      /expired/
    );
    const path = join(expired.directory, "revocations.json");
    const value = signedEnvelopeSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
    value.signed.expires = "2030-01-01T00:00:00.000Z";
    await writeFile(path, JSON.stringify(value));
    await assert.rejects(
      readRevokedHashes(pathToFileURL(`${expired.directory}/`), new Date("2026-09-12")),
      /threshold not met/
    );
  } finally {
    await rm(expired.directory, { recursive: true, force: true });
  }
});
