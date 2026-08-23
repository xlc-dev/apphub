import { readFile } from "node:fs/promises";
import { downloadHistorySchema } from "#catalog/downloads";
import { readApps, root } from "#catalog/core";
import { repositoryStarEtagsSchema, repositoryStarsSchema } from "#catalog/stars";

const entries = await readApps();

for (const { app, hasLock } of entries) {
  if (!hasLock) {
    throw new Error(`${app.id}: release lock is missing`);
  }
}

downloadHistorySchema.parse(
  JSON.parse(await readFile(new URL(".generated/downloads.json", root), "utf8"))
);

repositoryStarsSchema.parse(
  JSON.parse(await readFile(new URL(".generated/stars.json", root), "utf8"))
);

repositoryStarEtagsSchema.parse(
  JSON.parse(await readFile(new URL(".generated/star-etags.json", root), "utf8"))
);

console.log(`Validated ${entries.length} application${entries.length === 1 ? "" : "s"}.`);
