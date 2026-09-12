import { readFile } from "node:fs/promises";
import { readCatalogSnapshot } from "#catalog/snapshot";
import { readRevokedHashes } from "#catalog/tuf/revocations";
import { readApps } from "#catalog/storage";
import { createTrustedCatalog } from "#catalog/tuf/catalog";
import {
  hashTarget,
  signedEnvelopeSchema,
  signTuf,
  tufRootSchema,
  tufSnapshotSchema,
  tufTargetsSchema,
  tufTimestampSchema,
  verifyTufRole,
} from "#catalog/tuf/metadata";

interface SigningKeys {
  targets: string;
  snapshot: string;
  timestamp: string;
}

interface PreviousVersions {
  targets?: number;
  snapshot?: number;
  timestamp?: number;
}

function expires(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export async function createTufMetadata(
  rootEnvelopeValue: unknown,
  keys: SigningKeys,
  previous: PreviousVersions = {},
  now = new Date()
) {
  const rootEnvelope = signedEnvelopeSchema.parse(rootEnvelopeValue);
  const root = tufRootSchema.parse(rootEnvelope.signed);

  verifyTufRole(root, "root", rootEnvelope, { now, minimumVersion: root.version });

  const entries = await readApps();
  const catalog = createTrustedCatalog(
    entries,
    await readCatalogSnapshot(),
    now,
    await readRevokedHashes(undefined, now)
  );
  const catalogBytes = jsonBytes(catalog);
  const targets = signTuf(
    tufTargetsSchema.parse({
      _type: "targets",
      spec_version: "1.0.31",
      version: (previous.targets ?? 0) + 1,
      expires: expires(now, 30),
      targets: { "catalog.json": hashTarget(catalogBytes) },
    }),
    keys.targets
  );
  verifyTufRole(root, "targets", targets, { now });

  const targetsBytes = jsonBytes(targets);
  const snapshot = signTuf(
    tufSnapshotSchema.parse({
      _type: "snapshot",
      spec_version: "1.0.31",
      version: (previous.snapshot ?? 0) + 1,
      expires: expires(now, 7),
      meta: {
        "targets.json": { version: targets.signed.version, ...hashTarget(targetsBytes) },
      },
    }),
    keys.snapshot
  );
  verifyTufRole(root, "snapshot", snapshot, { now });

  const snapshotBytes = jsonBytes(snapshot);
  const timestamp = signTuf(
    tufTimestampSchema.parse({
      _type: "timestamp",
      spec_version: "1.0.31",
      version: (previous.timestamp ?? 0) + 1,
      expires: expires(now, 2),
      meta: {
        "snapshot.json": { version: snapshot.signed.version, ...hashTarget(snapshotBytes) },
      },
    }),
    keys.timestamp
  );
  verifyTufRole(root, "timestamp", timestamp, { now });

  return { catalog, targets, snapshot, timestamp };
}

export async function readTufVersion(path: URL) {
  try {
    const envelope = signedEnvelopeSchema.parse(JSON.parse(await readFile(path, "utf8")));
    return Number(envelope.signed.version);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
