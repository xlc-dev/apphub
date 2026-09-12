import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  signTuf,
  tufKeyFromPrivate,
  tufRevocationsSchema,
  tufRootSchema,
} from "#catalog/tuf/metadata";
import { writeJsonAtomic } from "#scripts/files";

const privateDirectoryArgument = process.argv[2];
if (!privateDirectoryArgument || !isAbsolute(privateDirectoryArgument)) {
  throw new Error("usage: bun run create-tuf-root -- /absolute/offline/private-directory");
}

const project = resolve(new URL("../..", import.meta.url).pathname);
const privateDirectory = resolve(privateDirectoryArgument);
const relativePrivateDirectory = relative(project, privateDirectory);
if (!relativePrivateDirectory.startsWith("..") || relativePrivateDirectory === "") {
  throw new Error("private keys must be written outside the repository");
}

function createPrivateKey() {
  return generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
}

const names = ["root", "targets", "snapshot", "timestamp", "revocations"] as const;
const keys = Object.fromEntries(names.map((name) => [name, createPrivateKey()])) as Record<
  (typeof names)[number],
  string
>;
const publicKeys = Object.fromEntries(
  names.map((name) => {
    const key = tufKeyFromPrivate(keys[name]);
    return [key.keyid, key.value];
  })
);
const role = (name: (typeof names)[number]) => {
  const key = tufKeyFromPrivate(keys[name]);
  return { keyids: [key.keyid], threshold: 1 };
};
const now = new Date();
const root = tufRootSchema.parse({
  _type: "root",
  spec_version: "1.0.31",
  version: 1,
  expires: new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
  consistent_snapshot: true,
  keys: publicKeys,
  roles: Object.fromEntries(names.map((name) => [name, role(name)])),
});
const revocations = tufRevocationsSchema.parse({
  _type: "revocations",
  spec_version: "1.0.31",
  version: 1,
  expires: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(),
  revoked: [],
});

await mkdir(privateDirectory, { recursive: false, mode: 0o700 });
for (const name of names) {
  await writeFile(resolve(privateDirectory, `${name}.private.pem`), keys[name], {
    flag: "wx",
    mode: 0o600,
  });
}

await mkdir(new URL("../../trust/", import.meta.url), { recursive: true });
await writeJsonAtomic(new URL("../../trust/root.json", import.meta.url), signTuf(root, keys.root));
await writeJsonAtomic(
  new URL("../../trust/revocations.json", import.meta.url),
  signTuf(revocations, keys.revocations)
);
await writeJsonAtomic(new URL("../../revocations.json", import.meta.url), {
  version: 1,
  revoked: [],
});
