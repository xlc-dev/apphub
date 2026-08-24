import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

const maxRedirects = 5;

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a! >= 224
  );
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0]!;
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];

  if (mapped) {
    return isPrivateIpv4(mapped);
  }

  if (normalized.includes(".")) {
    return isPrivateIpv4(normalized);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  );
}

async function resolve(hostname: string) {
  return lookup(hostname, { all: true });
}

export async function assertPublicUrl(url: URL, resolver: Resolver = resolve) {
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error(`${url}: remote URLs must use HTTPS without credentials or a custom port`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`${url}: remote URL does not resolve exclusively to public addresses`);
  }
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
    await assertPublicUrl(url, urlResolver);

    const response = await fetcher(url.toString(), { ...init, headers, redirect: "manual" });

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
      headers = new Headers(headers);
      headers.delete("authorization");
      headers.delete("cookie");
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

  return Buffer.concat(chunks, size);
}
