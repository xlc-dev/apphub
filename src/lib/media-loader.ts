import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { githubMediaMapSchema } from "#catalog/github-publication";

const repository = process.env.APPHUB_ASSET_REPOSITORY ?? "xlc-dev/apphub";

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error("APPHUB_ASSET_REPOSITORY must be an owner/repository name");
}

const mapping = githubMediaMapSchema.parse(
  JSON.parse(await readFile(resolve(".generated/media-map.json"), "utf8"))
);

function mediaAsset(file: string) {
  const asset = mapping.assets[file];
  if (asset?.sha256 !== file.replace(/\.webp$/, "")) {
    throw new Error(`${file}: immutable GitHub media mapping is missing`);
  }

  return asset;
}

export function mediaUrl(file: string) {
  const asset = mediaAsset(file);

  return `https://github.com/${repository}/releases/download/${asset.tag}/${file}`;
}

export async function mediaBytes(file: string) {
  const asset = mediaAsset(file);
  const response = await fetch(mediaUrl(file));
  if (!response.ok) throw new Error(`${file}: GitHub media returned HTTP ${response.status}`);

  const data = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== asset.size || hash !== asset.sha256) {
    throw new Error(`${file}: GitHub media does not match its mapping`);
  }

  return data;
}
