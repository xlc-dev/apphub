import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  hashTarget,
  signTuf,
  signTufWithKeys,
  tufKeyFromPrivate,
  verifyRootUpdate,
  verifyTarget,
  verifyTufRole,
} from "#catalog/tuf/metadata";

function privateKey() {
  return generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
}

function fixture(expires = "2030-01-01T00:00:00.000Z") {
  const privatePem = privateKey();
  const key = tufKeyFromPrivate(privatePem);
  const role = { keyids: [key.keyid], threshold: 1 };
  const root = {
    _type: "root" as const,
    spec_version: "1.0.31" as const,
    version: 1,
    expires: "2030-01-01T00:00:00.000Z",
    consistent_snapshot: true as const,
    keys: { [key.keyid]: key.value },
    roles: { root: role, targets: role, snapshot: role, timestamp: role, revocations: role },
  };
  const signed = signTuf({ _type: "targets", version: 2, expires, targets: {} }, privatePem);
  return { root, signed };
}

test("TUF role verification accepts a trusted signature", () => {
  const { root, signed } = fixture();
  assert.equal(verifyTufRole(root, "targets", signed, { now: new Date("2029-01-01") }).version, 2);
});

test("TUF role verification rejects signature mismatch", () => {
  const { root, signed } = fixture();
  signed.signed.version = 3;
  assert.throws(() => verifyTufRole(root, "targets", signed), /threshold not met/);
});

test("TUF role verification rejects rollback", () => {
  const { root, signed } = fixture();
  assert.throws(() => verifyTufRole(root, "targets", signed, { minimumVersion: 3 }), /rollback/);
});

test("TUF role verification rejects expiration and freeze", () => {
  const { root, signed } = fixture("2026-01-01T00:00:00.000Z");
  assert.throws(
    () => verifyTufRole(root, "targets", signed, { now: new Date("2026-01-02") }),
    /expired/
  );
});

test("TUF role verification rejects an expired root", () => {
  const { root, signed } = fixture();
  root.expires = "2026-01-01T00:00:00.000Z";
  assert.throws(
    () => verifyTufRole(root, "targets", signed, { now: new Date("2026-01-02") }),
    /root metadata is expired/
  );
});

test("TUF role verification rejects metadata for another role", () => {
  const { root, signed } = fixture();
  assert.throws(() => verifyTufRole(root, "snapshot", signed), /Invalid input/);
});

test("TUF target verification rejects changed bytes", () => {
  const trusted = new TextEncoder().encode("trusted");
  const changed = new TextEncoder().encode("changed");
  assert.throws(() => verifyTarget(changed, hashTarget(trusted)), /mismatch/);
});

test("root rotation requires the old and new root keys", () => {
  const oldPrivate = privateKey();
  const oldKey = tufKeyFromPrivate(oldPrivate);
  const oldRole = { keyids: [oldKey.keyid], threshold: 1 };
  const oldRoot = {
    _type: "root" as const,
    spec_version: "1.0.31" as const,
    version: 1,
    expires: "2030-01-01T00:00:00.000Z",
    consistent_snapshot: true as const,
    keys: { [oldKey.keyid]: oldKey.value },
    roles: {
      root: oldRole,
      targets: oldRole,
      snapshot: oldRole,
      timestamp: oldRole,
      revocations: oldRole,
    },
  };
  const newPrivate = privateKey();
  const newKey = tufKeyFromPrivate(newPrivate);
  const newRole = { keyids: [newKey.keyid], threshold: 1 };
  const newRoot = {
    ...oldRoot,
    version: 2,
    keys: { [newKey.keyid]: newKey.value },
    roles: {
      root: newRole,
      targets: newRole,
      snapshot: newRole,
      timestamp: newRole,
      revocations: newRole,
    },
  };

  assert.equal(
    verifyRootUpdate(oldRoot, signTufWithKeys(newRoot, [oldPrivate, newPrivate])).version,
    2
  );
  assert.throws(() => verifyRootUpdate(oldRoot, signTuf(newRoot, newPrivate)), /threshold not met/);
  assert.throws(
    () =>
      verifyRootUpdate(
        oldRoot,
        signTufWithKeys({ ...newRoot, version: 3 }, [oldPrivate, newPrivate])
      ),
    /exactly one/
  );
});
