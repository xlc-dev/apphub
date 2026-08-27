import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { recordResponseBytes, scheduleRequest } from "#catalog/network";
import type { HttpValidator } from "#catalog/refresh";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

const maxRedirects = 5;
const blockedAddresses = new BlockList();

for (const [address, prefix, family] of [
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 16, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"],
  ["240.0.0.0", 4, "ipv4"],
  ["::", 3, "ipv6"],
  ["4000::", 2, "ipv6"],
  ["8000::", 1, "ipv6"],
  ["2001::", 23, "ipv6"],
  ["2002::", 16, "ipv6"],
] as const) {
  blockedAddresses.addSubnet(address, prefix, family);
}

export function conditionalHeaders(validator?: HttpValidator) {
  return {
    ...(validator?.etag ? { "If-None-Match": validator.etag } : {}),
    ...(validator?.lastModified ? { "If-Modified-Since": validator.lastModified } : {}),
  };
}

export function responseValidator(response: Response): HttpValidator | undefined {
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;

  return etag || lastModified
    ? { ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) }
    : undefined;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0]!;
  const version = isIP(normalized);

  return version === 0 || blockedAddresses.check(normalized, version === 4 ? "ipv4" : "ipv6");
}

async function resolve(hostname: string) {
  return lookup(hostname, { all: true });
}

export async function assertPublicUrl(url: URL, resolver: Resolver = resolve) {
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error(`${url}: remote URLs must use HTTPS without credentials or a custom port`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const resolved = isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);
  const addresses = resolved.map(({ address }) => ({ address, family: isIP(address) }));

  if (
    !addresses.length ||
    addresses.some(({ address, family }) => family === 0 || isPrivateAddress(address))
  ) {
    throw new Error(`${url}: remote URL does not resolve exclusively to public addresses`);
  }

  return addresses as LookupAddress[];
}

export function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const family = typeof options.family === "number" ? options.family : 0;
    const matches = family ? addresses.filter((address) => address.family === family) : addresses;

    if (!matches.length) {
      callback(new Error("No validated address matches the requested address family"), "");

      return;
    }

    if (options.all) {
      callback(null, matches);

      return;
    }

    callback(null, matches[0]!.address, matches[0]!.family);
  };
}

function connectedToValidatedAddress(address: string | undefined, addresses: LookupAddress[]) {
  if (!address) return false;

  const allowed = new BlockList();

  for (const item of addresses) {
    allowed.addAddress(item.address, item.family === 4 ? "ipv4" : "ipv6");
  }

  const family = isIP(address);

  return family !== 0 && allowed.check(address, family === 4 ? "ipv4" : "ipv6");
}

function pinnedFetch(url: URL, init: RequestInit, addresses: LookupAddress[]) {
  if (init.body !== undefined && init.body !== null) {
    throw new Error("Remote fetch request bodies are not supported");
  }

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers)),
        lookup: pinnedLookup(addresses),
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        if (
          incoming.socket.remoteAddress &&
          !connectedToValidatedAddress(incoming.socket.remoteAddress, addresses)
        ) {
          incoming.destroy();
          reject(new Error(`${url}: connected to an address that was not validated`));

          return;
        }

        if (!incoming.statusCode) {
          incoming.destroy();
          reject(new Error(`${url}: remote response has no status`));

          return;
        }

        const headers = new Headers();

        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
        }

        const empty = init.method === "HEAD" || [101, 204, 205, 304].includes(incoming.statusCode);

        if (empty) incoming.resume();

        resolve(
          new Response(empty ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status: incoming.statusCode,
            ...(incoming.statusMessage ? { statusText: incoming.statusMessage } : {}),
            headers,
          })
        );
      }
    );

    request.on("error", reject);
    request.end();
  });
}

export async function safeFetch(
  input: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
  resolver?: Resolver
) {
  let url = new URL(input);
  let headers = new Headers(init.headers);
  const urlResolver =
    resolver ?? (fetcher === fetch ? resolve : () => Promise.resolve([{ address: "1.1.1.1" }]));

  for (let redirects = 0; ; redirects++) {
    const addresses = await assertPublicUrl(url, urlResolver);

    const response = await scheduleRequest(
      url,
      () =>
        fetcher === fetch
          ? pinnedFetch(url, { ...init, headers, redirect: "manual" }, addresses)
          : fetcher(url.toString(), { ...init, headers, redirect: "manual" }),
      fetcher === fetch
    );

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    if (redirects === maxRedirects) {
      throw new Error(`${input}: too many redirects`);
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new Error(`${url}: redirect is missing a location`);
    }

    const next = new URL(location, url);

    await response.body?.cancel();

    if (next.origin !== url.origin) {
      headers = new Headers();
    }

    url = next;
  }
}

export async function readResponse(response: Response, sizeLimit: number, source: string) {
  const length = Number(response.headers.get("content-length"));

  if (Number.isFinite(length) && length > sizeLimit) {
    throw new Error(`Response is too large: ${source}`);
  }

  if (!response.body) {
    throw new Error(`Empty response from ${source}`);
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > sizeLimit) {
      await reader.cancel();
      throw new Error(`Response is too large: ${source}`);
    }

    chunks.push(value);
  }

  recordResponseBytes(response, size);

  return Buffer.concat(chunks, size);
}
