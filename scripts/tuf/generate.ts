import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createTufMetadata, readTufVersion } from "#catalog/tuf/generation";
import { hashTarget } from "#catalog/tuf/metadata";
import { writeJsonAtomic } from "#scripts/files";

const rootPath = new URL("../../trust/root.json", import.meta.url);
const output = new URL("../../.generated/tuf/", import.meta.url);
const keys = {
  targets: process.env.APPHUB_TUF_TARGETS_KEY,
  snapshot: process.env.APPHUB_TUF_SNAPSHOT_KEY,
  timestamp: process.env.APPHUB_TUF_TIMESTAMP_KEY,
};

for (const [role, key] of Object.entries(keys)) {
  if (!key) throw new Error(`APPHUB_TUF_${role.toUpperCase()}_KEY is required`);
}

const targetsVersion = await readTufVersion(new URL("targets.json", output));
const snapshotVersion = await readTufVersion(new URL("snapshot.json", output));
const timestampVersion = await readTufVersion(new URL("timestamp.json", output));
const previous = {
  ...(targetsVersion ? { targets: targetsVersion } : {}),
  ...(snapshotVersion ? { snapshot: snapshotVersion } : {}),
  ...(timestampVersion ? { timestamp: timestampVersion } : {}),
};
const metadata = await createTufMetadata(
  JSON.parse(await readFile(rootPath, "utf8")),
  keys as { targets: string; snapshot: string; timestamp: string },
  previous
);
const catalogHash = hashTarget(Buffer.from(`${JSON.stringify(metadata.catalog, null, 2)}\n`)).hashes
  .sha256;

await mkdir(output, { recursive: true });
for (const name of await readdir(output)) await rm(new URL(name, output), { recursive: true });

await writeJsonAtomic(new URL(`${catalogHash}.catalog.json`, output), metadata.catalog);
await writeJsonAtomic(
  new URL(`${metadata.targets.signed.version}.targets.json`, output),
  metadata.targets
);
await writeJsonAtomic(
  new URL(`${metadata.snapshot.signed.version}.snapshot.json`, output),
  metadata.snapshot
);
await writeJsonAtomic(new URL("targets.json", output), metadata.targets);
await writeJsonAtomic(new URL("snapshot.json", output), metadata.snapshot);
await writeJsonAtomic(new URL("timestamp.json", output), metadata.timestamp);
