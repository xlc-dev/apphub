import { readFile, readdir } from "node:fs/promises";

const base = "/apphub";
const site = "https://xlc-dev.github.io";
let checked = 0;

function checkUrl(value: string, source: string) {
  let path;

  if (value.startsWith("/")) {
    path = value;
  } else if (value.startsWith("https://")) {
    const url = new URL(value);

    if (url.origin !== site) return;

    path = url.pathname;
  } else {
    return;
  }

  if (path !== base && !path.startsWith(`${base}/`)) {
    throw new Error(`${source}: ${value} does not use deployment base ${base}`);
  }

  checked++;
}

function checkJson(value: unknown, source: string) {
  if (typeof value === "string") {
    if (value.startsWith("/")) checkUrl(value, source);
  } else if (Array.isArray(value)) {
    value.forEach((child) => checkJson(child, source));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((child) => checkJson(child, source));
  }
}

for (const path of await readdir("dist", { recursive: true })) {
  const source = `dist/${path}`;

  if (path.endsWith(".json")) {
    checkJson(JSON.parse(await readFile(source, "utf8")), source);
    continue;
  }

  if (!path.endsWith(".html") && !path.endsWith(".css")) continue;

  const content = await readFile(source, "utf8");
  const patterns = path.endsWith(".html")
    ? [/(?:href|src|action)="([^"]+)"/g, /https:\/\/xlc-dev\.github\.io[^"<\s]*/g]
    : [/url\(["']?([^"')]+)["']?\)/g];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) checkUrl(match[1] ?? match[0], source);
  }
}

console.log(`Validated ${checked} generated URLs for deployment base ${base}.`);
