import { writeFile } from "node:fs/promises";

const globalLimit = 8;
const defaultHostLimit = 3;
const hostLimits: Record<string, number> = {
  "api.github.com": 2,
  "codeberg.org": 2,
  "flathub.org": 2,
  "gitlab.com": 2,
};

class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(operation: () => Promise<T>) {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.active++;

    try {
      return await operation();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

interface HostMetrics {
  requests: number;
  bytes: number;
  blockedUntil?: string;
}

const startedAt = Date.now();
const globalLimiter = new Limiter(globalLimit);
const limiters = new Map<string, Limiter>();
const metrics = new Map<string, HostMetrics>();
const responseHosts = new WeakMap<Response, string>();

function hostMetrics(host: string) {
  let value = metrics.get(host);

  if (!value) {
    value = { requests: 0, bytes: 0 };
    metrics.set(host, value);
  }

  return value;
}

function retryAt(response: Response) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    const time = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);

    if (Number.isFinite(time)) return new Date(time).toISOString();
  }

  const resetHeader = response.headers.get("x-ratelimit-reset");
  const reset = resetHeader ? Number(resetHeader) : Number.NaN;

  return Number.isFinite(reset)
    ? new Date(reset * 1000).toISOString()
    : new Date(Date.now() + 60_000).toISOString();
}

export class ProviderRateLimitError extends Error {}

export async function scheduleRequest<T>(
  url: URL,
  operation: () => Promise<T>,
  enforceRateLimits = true
) {
  const host = url.hostname;
  let limiter = limiters.get(host);

  if (!limiter) {
    limiter = new Limiter(hostLimits[host] ?? defaultHostLimit);
    limiters.set(host, limiter);
  }

  return limiter.run(() =>
    globalLimiter.run(async () => {
      const state = hostMetrics(host);

      if (enforceRateLimits && state.blockedUntil && Date.parse(state.blockedUntil) > Date.now()) {
        throw new ProviderRateLimitError(`${host}: rate limited until ${state.blockedUntil}`);
      }

      state.requests++;
      const response = await operation();

      if (response instanceof Response) {
        responseHosts.set(response, host);

        if (
          enforceRateLimits &&
          (response.status === 429 ||
            (response.status === 403 &&
              (response.headers.has("retry-after") ||
                response.headers.get("x-ratelimit-remaining") === "0")))
        ) {
          state.blockedUntil = retryAt(response);
        }
      }

      return response;
    })
  );
}

export function recordResponseBytes(response: Response, bytes: number) {
  const host = responseHosts.get(response);

  if (host) hostMetrics(host).bytes += bytes;
}

export function refreshNetworkSummary() {
  return {
    durationMs: Date.now() - startedAt,
    requests: [...metrics.values()].reduce((total, value) => total + value.requests, 0),
    bytes: [...metrics.values()].reduce((total, value) => total + value.bytes, 0),
    hosts: Object.fromEntries([...metrics].sort(([left], [right]) => left.localeCompare(right))),
  };
}

export async function printRefreshNetworkSummary() {
  const summary = refreshNetworkSummary();

  console.log(
    `Refresh network: ${summary.requests} requests, ${summary.bytes} bytes, ${(summary.durationMs / 1000).toFixed(1)} seconds`
  );

  for (const [host, value] of Object.entries(summary.hosts)) {
    console.log(
      `${host}: ${value.requests} requests, ${value.bytes} bytes${value.blockedUntil ? `, blocked until ${value.blockedUntil}` : ""}`
    );
  }

  if (process.env.APPHUB_REFRESH_NETWORK_REPORT) {
    await writeFile(
      process.env.APPHUB_REFRESH_NETWORK_REPORT,
      `${JSON.stringify(summary, null, 2)}\n`
    );
  }
}
