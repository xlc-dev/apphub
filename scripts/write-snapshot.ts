import { readFile } from "node:fs/promises";
import { calculateCatalogRevision, catalogSnapshotSchema } from "#catalog/snapshot";
import { writeJsonAtomic } from "#scripts/files";

const projectDirectory = new URL("../", import.meta.url);

export async function writeCatalogSnapshot(now = new Date(), directory = projectDirectory) {
  const snapshotUrl = new URL(".generated/snapshot.json", directory);
  const revision = await calculateCatalogRevision(directory);
  let previous;

  try {
    previous = catalogSnapshotSchema.parse(JSON.parse(await readFile(snapshotUrl, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (previous?.revision === revision) return previous;

  const snapshot = catalogSnapshotSchema.parse({ revision, generatedAt: now.toISOString() });

  await writeJsonAtomic(snapshotUrl, snapshot);

  return snapshot;
}

if (import.meta.main) await writeCatalogSnapshot();
