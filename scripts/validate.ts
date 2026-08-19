import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { downloadHistorySchema } from "@catalog/downloads";
import { readApps, root, sha256, validatePng, validateScreenshot } from "@catalog/core";
import { appJsonSchema } from "@catalog/schema";

const entries = await readApps();

for (const { app, directory, hasLock, lock } of entries) {
  const iconUrl = new URL("icon.png", directory);

  if (!hasLock) throw new Error(`${app.id}: release lock is missing`);

  if (!lock.icon) throw new Error(`${app.id}: release lock has no icon metadata`);

  const icon = await readFile(iconUrl);

  validatePng(icon, app.id);
  if (icon.byteLength !== lock.icon.size || sha256(icon) !== lock.icon.sha256)
    throw new Error(`${app.id}: generated icon does not match its lock`);

  for (const screenshot of app.screenshots) {
    validateScreenshot(
      await readFile(new URL(screenshot.file, directory)),
      screenshot.file,
      app.id
    );
  }
}

const publicSchema = JSON.parse(
  await readFile(new URL("catalog/app.schema.json", root), "utf8")
) as unknown;

if (!isDeepStrictEqual(publicSchema, appJsonSchema()))
  throw new Error("catalog/app.schema.json is stale; run bun run schema");

downloadHistorySchema.parse(
  JSON.parse(await readFile(new URL("catalog/downloads.json", root), "utf8"))
);

console.log(`Validated ${entries.length} application${entries.length === 1 ? "" : "s"}.`);
