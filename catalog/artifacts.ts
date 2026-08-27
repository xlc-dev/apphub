import { createHash } from "node:crypto";
import { recordResponseBytes } from "#catalog/network";
import { safeFetch } from "#catalog/http";
import { RefreshError } from "#catalog/refresh";
import type { App, Architecture } from "#catalog/schema";

interface SelectableAsset {
  name: string;
}

interface Download {
  name: string;
  url: string;
  size?: number;
}

interface SelectedAsset<T extends SelectableAsset> {
  architecture: Architecture;
  asset: T;
}

const architectureMatchers: Array<[Architecture, RegExp]> = [
  ["x86_64", /(?:^|[^a-z0-9])(?:x86[_-]?64|amd64)(?:[^a-z0-9]|$)/i],
  ["i686", /(?:^|[^a-z0-9])(?:i[3-6]86|x86[_-]?32)(?:[^a-z0-9]|$)/i],
  ["aarch64", /(?:^|[^a-z0-9])(?:aarch64|arm64)(?:[^a-z0-9]|$)/i],
  ["armv7l", /(?:^|[^a-z0-9])(?:armv7l?|armhf)(?:[^a-z0-9]|$)/i],
  ["riscv64", /(?:^|[^a-z0-9])riscv64(?:[^a-z0-9]|$)/i],
  ["ppc64le", /(?:^|[^a-z0-9])ppc64le(?:[^a-z0-9]|$)/i],
  ["s390x", /(?:^|[^a-z0-9])s390x(?:[^a-z0-9]|$)/i],
];

export function globRegex(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`);
}

export function matchesArchitecture(name: string, architecture: Architecture) {
  if (!name.toLowerCase().endsWith(".appimage")) {
    return false;
  }

  const expression = architectureMatchers.find(([name]) => name === architecture)?.[1];

  return expression?.test(name) ?? false;
}

export function selectAssets<T extends SelectableAsset>(app: App, assets: T[]) {
  const selected: Array<SelectedAsset<T>> = [];

  const rules: Array<[Architecture, string | undefined]> = app.assets
    ? Object.entries(app.assets).sort(([left], [right]) => left.localeCompare(right))
    : architectureMatchers.map(([architecture]) => [architecture, undefined]);

  for (const [architecture, pattern] of rules) {
    const matches = assets.filter((asset) =>
      pattern ? globRegex(pattern).test(asset.name) : matchesArchitecture(asset.name, architecture)
    );
    const asset = matches[0];

    if (!pattern && matches.length === 0) {
      continue;
    }

    if (!asset || matches.length !== 1) {
      throw new RefreshError(
        "integrity",
        `${app.id}: expected one ${architecture} asset, found ${matches.length}`
      );
    }

    selected.push({ architecture, asset });
  }

  if (selected.length === 0) {
    throw new RefreshError("integrity", `${app.id}: no AppImage assets found`);
  }

  if (new Set(selected.map(({ asset }) => asset.name)).size !== selected.length) {
    throw new Error(`${app.id}: architecture rules selected the same asset`);
  }

  return selected;
}

export function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export async function hashDownload(
  file: Download,
  options: {
    maximumSize?: number;
    fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  } = {}
) {
  const { maximumSize = 2 * 1024 * 1024 * 1024, fetcher = fetch } = options;

  if (file.size !== undefined && file.size > maximumSize) {
    throw new Error(`${file.name}: published size exceeds download limit`);
  }

  const response = await safeFetch(file.url, { signal: AbortSignal.timeout(300_000) }, fetcher);

  if (!response.ok || !response.body) {
    throw new Error(`${file.name}: download returned ${response.status}`);
  }

  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  const sizeLimit = file.size ?? maximumSize;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > sizeLimit) {
      await reader.cancel();
      throw new Error(
        `${file.name}: download exceeds ${file.size === undefined ? "size limit" : "published size"}`
      );
    }

    hash.update(value);
  }

  if (file.size !== undefined && size !== file.size) {
    throw new Error(`${file.name}: download differs from published size`);
  }

  recordResponseBytes(response, size);

  return { size, sha256: hash.digest("hex") };
}
