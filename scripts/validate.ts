import { readFile } from "node:fs/promises";
import { downloadHistorySchema } from "#catalog/downloads";
import { readApps } from "#catalog/storage";
import { calculateCatalogRevision, readCatalogSnapshot } from "#catalog/snapshot";
import { repositoryStarEtagsSchema, repositoryStarsSchema } from "#lib/repository-stars";

const generatedDirectory = new URL("../.generated/", import.meta.url);

const entries = await readApps();

for (const { app, hasLock } of entries) {
  if (!hasLock) {
    throw new Error(`${app.id}: release lock is missing`);
  }
}

downloadHistorySchema.parse(
  JSON.parse(await readFile(new URL("downloads.json", generatedDirectory), "utf8"))
);

repositoryStarsSchema.parse(
  JSON.parse(await readFile(new URL("stars.json", generatedDirectory), "utf8"))
);

repositoryStarEtagsSchema.parse(
  JSON.parse(await readFile(new URL("star-etags.json", generatedDirectory), "utf8"))
);

const [snapshot, revision] = await Promise.all([readCatalogSnapshot(), calculateCatalogRevision()]);

if (snapshot.revision !== revision) {
  throw new Error("Generated catalog does not match .generated/snapshot.json");
}

console.log(`Validated ${entries.length} application${entries.length === 1 ? "" : "s"}.`);
