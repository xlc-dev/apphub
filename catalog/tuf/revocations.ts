import { readFile } from "node:fs/promises";
import {
  signedEnvelopeSchema,
  tufRevocationsSchema,
  tufRootSchema,
  verifyTufRole,
} from "#catalog/tuf/metadata";

async function optionalJson(path: URL) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readRevokedHashes(
  directory = new URL("../trust/", import.meta.url),
  now = new Date()
) {
  const [rootValue, revocationsValue] = await Promise.all([
    optionalJson(new URL("root.json", directory)),
    optionalJson(new URL("revocations.json", directory)),
  ]);

  if (!rootValue && !revocationsValue) return new Set<string>();
  if (!rootValue || !revocationsValue) throw new Error("incomplete TUF trust metadata");

  const rootEnvelope = signedEnvelopeSchema.parse(rootValue);
  const root = tufRootSchema.parse(rootEnvelope.signed);
  const revocationsEnvelope = signedEnvelopeSchema.parse(revocationsValue);

  verifyTufRole(root, "root", rootEnvelope, { now });
  verifyTufRole(root, "revocations", revocationsEnvelope, { now });

  const revocations = tufRevocationsSchema.parse(revocationsEnvelope.signed);
  return new Set(revocations.revoked.map(({ sha256 }) => sha256));
}
