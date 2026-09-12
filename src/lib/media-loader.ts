import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const media = import.meta.glob<string>("/.generated/media/*.webp", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

export function mediaUrl(file: string) {
  const url = media[`/.generated/media/${file}`];

  if (!url) throw new Error(`${file}: generated media is missing`);

  return url;
}

export function mediaBytes(file: string) {
  return readFile(resolve(".generated/media", file));
}
