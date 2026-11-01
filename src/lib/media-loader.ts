import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

const allowUnpublished = process.env.APPHUB_ALLOW_UNPUBLISHED_MEDIA === "1";

const localMedia = new Map<string, Buffer>();

function sha256Of(file: string) {
  return file.replace(/\.webp$/, "");
}

function readLocalMedia(file: string) {
  const cached = localMedia.get(file);
  if (cached) return cached;

  const data = readFileSync(resolve(".generated/media", file));
  if (createHash("sha256").update(data).digest("hex") !== sha256Of(file)) {
    throw new Error(`${file}: local media does not match its content hash`);
  }

  localMedia.set(file, data);
  return data;
}

function unpublishedMedia(file: string) {
  if (!allowUnpublished) return undefined;

  try {
    return readLocalMedia(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function mediaAsset(file: string) {
  const asset = mapping.assets[file];
  if (asset?.sha256 !== sha256Of(file)) {
    throw new Error(`${file}: immutable GitHub media mapping is missing`);
  }

  return asset;
}

export function mediaUrl(file: string) {
  const asset = mapping.assets[file];
  if (asset?.sha256 === sha256Of(file)) {
    return `https://github.com/${repository}/releases/download/${asset.tag}/${file}`;
  }

  const data = unpublishedMedia(file);
  if (data) return `data:image/webp;base64,${data.toString("base64")}`;

  throw new Error(`${file}: immutable GitHub media mapping is missing`);
}

export async function mediaBytes(file: string) {
  const data = unpublishedMedia(file);
  if (data) return data;

  const asset = mediaAsset(file);
  const response = await fetch(mediaUrl(file));
  if (!response.ok) throw new Error(`${file}: GitHub media returned HTTP ${response.status}`);

  const body = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(body).digest("hex");
  if (body.byteLength !== asset.size || hash !== asset.sha256) {
    throw new Error(`${file}: GitHub media does not match its mapping`);
  }

  return body;
}
