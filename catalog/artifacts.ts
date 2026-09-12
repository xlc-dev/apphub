import { createHash } from "node:crypto";
import {
  findSquashfsSuperblocks,
  inspectAppImage,
  type AppImageInspection,
} from "#catalog/appimage";
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
    architecture?: Architecture;
  } = {}
) {
  const { maximumSize = 2 * 1024 * 1024 * 1024, fetcher = fetch, architecture } = options;

  if (file.size !== undefined && file.size > maximumSize) {
    throw new Error(`${file.name}: published size exceeds download limit`);
  }

  const response = await safeFetch(file.url, { signal: AbortSignal.timeout(300_000) }, fetcher);

  if (!response.ok || !response.body) {
    throw new Error(`${file.name}: download returned ${response.status}`);
  }

  const hash = createHash("sha256");
  let size = 0;
  let prefix = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let archiveTail = Buffer.alloc(0);
  const squashfsSuperblocks: Array<{ offset: number; data: Buffer }> = [];
  let fuse = false;
  let zsync = false;
  const sizeLimit = file.size ?? maximumSize;
  const lengthHeader = response.headers.get("content-length");
  const responseLength = lengthHeader === null ? undefined : Number(lengthHeader);
  if (
    responseLength !== undefined &&
    Number.isFinite(responseLength) &&
    responseLength > sizeLimit
  ) {
    await response.body.cancel();
    throw new Error(
      `${file.name}: response exceeds ${file.size === undefined ? "size limit" : "published size"}`
    );
  }
  if (
    file.size !== undefined &&
    responseLength !== undefined &&
    Number.isFinite(responseLength) &&
    responseLength !== file.size
  ) {
    await response.body.cancel();
    throw new Error(`${file.name}: response differs from published size`);
  }
  const reader = response.body.getReader();
  const fusePattern = Buffer.from("libfuse.so.2");
  const zsyncPattern = Buffer.from("zsync|");
  const overlap = Math.max(fusePattern.length, zsyncPattern.length) - 1;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunkOffset = size;
    size += value.byteLength;

    if (size > sizeLimit) {
      await reader.cancel();
      throw new Error(
        `${file.name}: download exceeds ${file.size === undefined ? "size limit" : "published size"}`
      );
    }

    hash.update(value);

    if (prefix.length < 32_898) {
      prefix = Buffer.concat([prefix, Buffer.from(value)]).subarray(0, 32_898);
    }

    if (!fuse || !zsync) {
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      const searchable = tail.length ? Buffer.concat([tail, chunk]) : chunk;
      fuse ||= searchable.includes(fusePattern);
      zsync ||= searchable.includes(zsyncPattern);
      tail = Buffer.from(searchable.subarray(-overlap));
    }

    if (architecture) {
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      const archiveSearch = archiveTail.length ? Buffer.concat([archiveTail, chunk]) : chunk;
      squashfsSuperblocks.push(
        ...findSquashfsSuperblocks(archiveSearch, chunkOffset - archiveTail.length)
      );
      if (squashfsSuperblocks.length > 256)
        throw new Error("too many SquashFS markers in AppImage");
      archiveTail = Buffer.from(archiveSearch.subarray(-95));
    }
  }

  if (file.size !== undefined && size !== file.size) {
    throw new Error(`${file.name}: download differs from published size`);
  }

  recordResponseBytes(response, size);

  const runtimeType =
    prefix[8] === 0x41 && prefix[9] === 0x49 && [1, 2].includes(prefix[10]!)
      ? (prefix[10] as 1 | 2)
      : undefined;
  let inspection: AppImageInspection | undefined;
  try {
    inspection = architecture
      ? inspectAppImage(prefix, squashfsSuperblocks, size, architecture)
      : undefined;
  } catch (error) {
    throw new RefreshError(
      "integrity",
      `${file.name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    size,
    sha256: hash.digest("hex"),
    capabilities: {
      ...(runtimeType ? { runtimeType } : {}),
      fuse,
      zsync,
      anylinux: /(?:^|[^a-z0-9])anylinux(?:[^a-z0-9]|$)/i.test(file.name),
    },
    ...(inspection ? { inspection } : {}),
  };
}
