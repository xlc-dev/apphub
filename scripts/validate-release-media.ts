import { readFile } from "node:fs/promises";

const repository = process.env.APPHUB_ASSET_REPOSITORY ?? "xlc-dev/apphub";

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error("APPHUB_ASSET_REPOSITORY must be an owner/repository name");
}

const apps = await readFile("dist/api/v1/apps.json", "utf8");
const expected = `https://github.com/${repository}/releases/download/media-`;

if (!apps.includes(expected)) {
  throw new Error("API does not reference GitHub Release media");
}

console.log("Validated GitHub Release media.");
