import { readFile } from "node:fs/promises";
import {
  signedEnvelopeSchema,
  signTuf,
  tufRevocationsSchema,
  tufRootSchema,
  verifyTufRole,
} from "#catalog/tuf/metadata";
import { writeJsonAtomic } from "#scripts/files";

const sourceSchema = tufRevocationsSchema.pick({ version: true, revoked: true }).strict();
const sourcePath = new URL("../../revocations.json", import.meta.url);
const rootPath = new URL("../../trust/root.json", import.meta.url);
const publishedPath = new URL("../../trust/revocations.json", import.meta.url);
const privateKey = process.env.APPHUB_TUF_REVOCATIONS_KEY;
if (!privateKey) throw new Error("APPHUB_TUF_REVOCATIONS_KEY is required");

const source = sourceSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")));
const sha256 = process.env.APPHUB_REVOKE_SHA256;
const reason = process.env.APPHUB_REVOKE_REASON;
const now = new Date();

if ((sha256 && !reason) || (!sha256 && reason)) {
  throw new Error("APPHUB_REVOKE_SHA256 and APPHUB_REVOKE_REASON must be provided together");
}
if (sha256 && source.revoked.some((item) => item.sha256 === sha256)) {
  throw new Error(`${sha256} is already revoked`);
}

const revoked = sha256
  ? [...source.revoked, { sha256, reason, revokedAt: now.toISOString() }]
  : source.revoked;
const nextSource = sourceSchema.parse({ version: source.version + 1, revoked });
const metadata = tufRevocationsSchema.parse({
  _type: "revocations",
  spec_version: "1.0.31",
  version: nextSource.version,
  expires: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
  revoked,
});
const rootEnvelope = signedEnvelopeSchema.parse(JSON.parse(await readFile(rootPath, "utf8")));
const root = tufRootSchema.parse(rootEnvelope.signed);
const envelope = signTuf(metadata, privateKey);

verifyTufRole(root, "root", rootEnvelope, { now });
verifyTufRole(root, "revocations", envelope, { now });

await writeJsonAtomic(sourcePath, nextSource);
await writeJsonAtomic(publishedPath, envelope);
