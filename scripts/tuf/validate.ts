import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readRevokedHashes } from "#catalog/tuf/revocations";
import { readCatalogSnapshot } from "#catalog/snapshot";
import { readApps } from "#catalog/storage";
import { createTrustedCatalog, trustedCatalogSchema } from "#catalog/tuf/catalog";
import {
  canonicalJson,
  signedEnvelopeSchema,
  tufRevocationsSchema,
  tufRootSchema,
  tufSnapshotSchema,
  tufTargetsSchema,
  tufTimestampSchema,
  verifyTarget,
  verifyTufRole,
} from "#catalog/tuf/metadata";

const generated = new URL("../../.generated/tuf/", import.meta.url);
const trust = new URL("../../trust/", import.meta.url);

async function json(path: URL) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const now = new Date();
const rootEnvelope = signedEnvelopeSchema.parse(await json(new URL("root.json", trust)));
const root = tufRootSchema.parse(rootEnvelope.signed);
verifyTufRole(root, "root", rootEnvelope, { now });

const revocationsEnvelope = signedEnvelopeSchema.parse(
  await json(new URL("revocations.json", trust))
);
verifyTufRole(root, "revocations", revocationsEnvelope, { now });
tufRevocationsSchema.parse(revocationsEnvelope.signed);

const timestampEnvelope = signedEnvelopeSchema.parse(
  await json(new URL("timestamp.json", generated))
);
const timestamp = tufTimestampSchema.parse(
  verifyTufRole(root, "timestamp", timestampEnvelope, { now })
);
const snapshotDescription = timestamp.meta["snapshot.json"];
const snapshotBytes = await readFile(
  new URL(`${snapshotDescription.version}.snapshot.json`, generated)
);
verifyTarget(snapshotBytes, snapshotDescription);
const snapshotEnvelope = signedEnvelopeSchema.parse(JSON.parse(snapshotBytes.toString("utf8")));
const snapshot = tufSnapshotSchema.parse(
  verifyTufRole(root, "snapshot", snapshotEnvelope, { now })
);

const targetsDescription = snapshot.meta["targets.json"];
if (!targetsDescription) throw new Error("snapshot does not describe targets.json");
const targetsBytes = await readFile(
  new URL(`${targetsDescription.version}.targets.json`, generated)
);
verifyTarget(targetsBytes, targetsDescription);
const targetsEnvelope = signedEnvelopeSchema.parse(JSON.parse(targetsBytes.toString("utf8")));
const targets = tufTargetsSchema.parse(verifyTufRole(root, "targets", targetsEnvelope, { now }));

const catalogDescription = targets.targets["catalog.json"];
if (!catalogDescription) throw new Error("targets does not describe catalog.json");
const catalogBytes = await readFile(
  new URL(`${catalogDescription.hashes.sha256}.catalog.json`, generated)
);
verifyTarget(catalogBytes, catalogDescription);
const catalog = trustedCatalogSchema.parse(JSON.parse(catalogBytes.toString("utf8")));
const expected = createTrustedCatalog(
  await readApps(),
  await readCatalogSnapshot(),
  undefined,
  await readRevokedHashes()
);

assert.equal(
  canonicalJson(catalog),
  canonicalJson(expected),
  "signed catalog differs from source state"
);
