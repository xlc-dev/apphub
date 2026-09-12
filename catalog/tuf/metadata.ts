import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const tufKeySchema = z
  .object({
    keytype: z.literal("ed25519"),
    scheme: z.literal("ed25519"),
    keyval: z.object({ public: z.string().min(1) }).strict(),
  })
  .strict();

const roleSchema = z
  .object({
    keyids: z.array(hashSchema).min(1),
    threshold: z.number().int().positive(),
  })
  .strict()
  .refine(({ keyids, threshold }) => threshold <= keyids.length, "threshold exceeds role keys");

export const tufRootSchema = z
  .object({
    _type: z.literal("root"),
    spec_version: z.literal("1.0.31"),
    version: z.number().int().positive(),
    expires: z.iso.datetime(),
    consistent_snapshot: z.literal(true),
    keys: z.record(hashSchema, tufKeySchema),
    roles: z
      .object({
        root: roleSchema,
        targets: roleSchema,
        snapshot: roleSchema,
        timestamp: roleSchema,
        revocations: roleSchema,
      })
      .strict(),
  })
  .strict();

const signatureSchema = z
  .object({ keyid: hashSchema, sig: z.string().regex(/^(?:[a-f0-9]{2})+$/) })
  .strict();

export const signedEnvelopeSchema = z
  .object({
    signatures: z.array(signatureSchema).min(1),
    signed: z.record(z.string(), z.unknown()),
  })
  .strict();

export type TufKey = z.infer<typeof tufKeySchema>;
export type TufRoot = z.infer<typeof tufRootSchema>;
export type SignedEnvelope = z.infer<typeof signedEnvelopeSchema>;
export type TufRole = keyof TufRoot["roles"];

const targetDescriptionSchema = z
  .object({
    length: z.number().int().nonnegative(),
    hashes: z.object({ sha256: hashSchema }).strict(),
  })
  .strict();

const metadataDescriptionSchema = targetDescriptionSchema
  .extend({ version: z.number().int().positive() })
  .strict();

export const tufTargetsSchema = z
  .object({
    _type: z.literal("targets"),
    spec_version: z.literal("1.0.31"),
    version: z.number().int().positive(),
    expires: z.iso.datetime(),
    targets: z.record(z.string().min(1), targetDescriptionSchema),
  })
  .strict();

export const tufSnapshotSchema = z
  .object({
    _type: z.literal("snapshot"),
    spec_version: z.literal("1.0.31"),
    version: z.number().int().positive(),
    expires: z.iso.datetime(),
    meta: z.record(z.string().min(1), metadataDescriptionSchema),
  })
  .strict();

export const tufTimestampSchema = z
  .object({
    _type: z.literal("timestamp"),
    spec_version: z.literal("1.0.31"),
    version: z.number().int().positive(),
    expires: z.iso.datetime(),
    meta: z.object({ "snapshot.json": metadataDescriptionSchema }).strict(),
  })
  .strict();

export const tufRevocationsSchema = z
  .object({
    _type: z.literal("revocations"),
    spec_version: z.literal("1.0.31"),
    version: z.number().int().positive(),
    expires: z.iso.datetime(),
    revoked: z
      .array(
        z
          .object({
            sha256: hashSchema,
            revokedAt: z.iso.datetime(),
            reason: z.string().min(1).max(500),
          })
          .strict()
      )
      .refine(
        (items) => new Set(items.map(({ sha256 }) => sha256)).size === items.length,
        "revoked hashes must be unique"
      ),
  })
  .strict();

export type TargetDescription = z.infer<typeof targetDescriptionSchema>;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("canonical JSON does not support this value");
}

function publicDer(key: KeyObject) {
  return key.export({ type: "spki", format: "der" }).toString("base64");
}

export function tufKeyFromPrivate(privatePem: string) {
  const key = createPrivateKey(privatePem);
  const value = tufKeySchema.parse({
    keytype: "ed25519",
    scheme: "ed25519",
    keyval: { public: publicDer(createPublicKey(key)) },
  });

  return { key, value, keyid: createHash("sha256").update(canonicalJson(value)).digest("hex") };
}

function publicKey(key: TufKey) {
  return createPublicKey({
    key: Buffer.from(key.keyval.public, "base64"),
    type: "spki",
    format: "der",
  });
}

export function signTuf<T extends Record<string, unknown>>(signed: T, privatePem: string) {
  const key = tufKeyFromPrivate(privatePem);
  const signature = sign(null, Buffer.from(canonicalJson(signed)), key.key).toString("hex");

  return { signatures: [{ keyid: key.keyid, sig: signature }], signed };
}

export function signTufWithKeys(signed: Record<string, unknown>, privatePems: string[]) {
  if (!privatePems.length) throw new Error("at least one signing key is required");

  const signatures = privatePems.map((privatePem) => signTuf(signed, privatePem).signatures[0]!);

  return signedEnvelopeSchema.parse({ signatures, signed });
}

export function verifyTufRole(
  rootValue: unknown,
  role: TufRole,
  envelopeValue: unknown,
  options: { now?: Date; minimumVersion?: number } = {}
) {
  const root = tufRootSchema.parse(rootValue);
  const envelope = signedEnvelopeSchema.parse(envelopeValue);
  const metadata = z
    .looseObject({
      _type: z.literal(role),
      version: z.number().int().positive(),
      expires: z.iso.datetime(),
    })
    .parse(envelope.signed);
  const now = options.now ?? new Date();

  if (Date.parse(root.expires) <= now.getTime()) throw new Error("root metadata is expired");
  if (Date.parse(metadata.expires) <= now.getTime()) throw new Error(`${role} metadata is expired`);
  if (metadata.version < (options.minimumVersion ?? 0))
    throw new Error(`${role} metadata rollback`);

  const trusted = root.roles[role];
  const valid = new Set<string>();
  const bytes = Buffer.from(canonicalJson(envelope.signed));

  for (const signature of envelope.signatures) {
    const key = root.keys[signature.keyid];
    if (
      key &&
      trusted.keyids.includes(signature.keyid) &&
      verify(null, bytes, publicKey(key), Buffer.from(signature.sig, "hex"))
    ) {
      valid.add(signature.keyid);
    }
  }

  if (valid.size < trusted.threshold) throw new Error(`${role} signature threshold not met`);

  return metadata;
}

export function verifyRootUpdate(
  trustedRootValue: unknown,
  nextEnvelopeValue: unknown,
  now = new Date()
) {
  const trustedRoot = tufRootSchema.parse(trustedRootValue);
  const nextEnvelope = signedEnvelopeSchema.parse(nextEnvelopeValue);
  const nextRoot = tufRootSchema.parse(nextEnvelope.signed);

  if (nextRoot.version !== trustedRoot.version + 1) {
    throw new Error("root metadata version must increase by exactly one");
  }

  verifyTufRole(trustedRoot, "root", nextEnvelope, { now, minimumVersion: nextRoot.version });
  verifyTufRole(nextRoot, "root", nextEnvelope, { now, minimumVersion: nextRoot.version });

  return nextRoot;
}

export function hashTarget(data: Uint8Array) {
  return {
    length: data.byteLength,
    hashes: { sha256: createHash("sha256").update(data).digest("hex") },
  };
}

export function verifyTarget(data: Uint8Array, target: ReturnType<typeof hashTarget>) {
  const actual = hashTarget(data);
  if (actual.length !== target.length || actual.hashes.sha256 !== target.hashes.sha256) {
    throw new Error("target length or SHA-256 mismatch");
  }
}
