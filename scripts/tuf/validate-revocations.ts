import { readFile } from "node:fs/promises";
import {
  signedEnvelopeSchema,
  tufRevocationsSchema,
  tufRootSchema,
  verifyTufRole,
} from "#catalog/tuf/metadata";

const trust = new URL("../../trust/", import.meta.url);
const rootEnvelope = signedEnvelopeSchema.parse(
  JSON.parse(await readFile(new URL("root.json", trust), "utf8"))
);
const root = tufRootSchema.parse(rootEnvelope.signed);
const revocationsEnvelope = signedEnvelopeSchema.parse(
  JSON.parse(await readFile(new URL("revocations.json", trust), "utf8"))
);

verifyTufRole(root, "root", rootEnvelope);
verifyTufRole(root, "revocations", revocationsEnvelope);
tufRevocationsSchema.parse(revocationsEnvelope.signed);
