import { createHash } from "node:crypto";
import { z } from "zod";
import { catalogStatus, catalogStatusSchema } from "#catalog/refresh";
import { sandboxV1Schema } from "#catalog/sandbox-v1";
import {
  applicationSlugSchema,
  architectureSchema,
  artifactInspectionSchema,
  httpsUrlSchema,
} from "#catalog/schema";
import type { App, CatalogProvenance, ReleaseLock } from "#catalog/schema";
import type { SandboxV1 } from "#catalog/sandbox-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

function sandboxPolicyHash(sandbox: SandboxV1) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(sandboxV1Schema.parse(sandbox))))
    .digest("hex");
}

function publisherIdentity(provenance: CatalogProvenance) {
  const source = provenance.releaseSource;
  return JSON.stringify({
    provider: source.provider,
    ownerId: source.ownerId ?? null,
    projectId: source.projectId ?? null,
    configuredUrl: source.configuredUrl,
  });
}

const trustedArtifactSchema = z
  .object({
    architecture: architectureSchema,
    url: httpsUrlSchema,
    size: z.number().int().positive(),
    sha256: hashSchema,
    inspection: artifactInspectionSchema.nullable(),
    installable: z.boolean(),
  })
  .strict();

export const trustedCatalogSchema = z
  .object({
    version: z.literal(1),
    revision: hashSchema,
    generatedAt: z.iso.datetime(),
    apps: z.array(
      z
        .object({
          id: z.string().min(1).max(255),
          slug: applicationSlugSchema,
          status: catalogStatusSchema,
          publisher: z
            .object({
              identity: z.string().min(1).max(500),
              evidence: httpsUrlSchema,
            })
            .strict(),
          sandbox: z.object({ sha256: hashSchema, policy: sandboxV1Schema }).strict(),
          release: z
            .object({
              version: z.string().min(1).max(200),
              publishedAt: z.iso.datetime(),
              artifacts: z.array(trustedArtifactSchema).min(1).max(10),
            })
            .strict()
            .nullable(),
        })
        .strict()
    ),
  })
  .strict();

interface TrustedCatalogEntry {
  slug: string;
  app: App;
  lock: ReleaseLock;
}

export function createTrustedCatalog(
  entries: TrustedCatalogEntry[],
  snapshot: { revision: string; generatedAt: string },
  now = new Date(snapshot.generatedAt),
  revoked = new Set<string>()
) {
  const apps = entries.map(({ slug, app, lock }) => {
    const release = lock.releases[0];
    const refreshStatus = catalogStatus(
      app.provenance.refresh.metadata,
      app.provenance.refresh.releases,
      now
    );
    const isRevoked = Boolean(release?.artifacts.some(({ sha256 }) => revoked.has(sha256)));
    const status = isRevoked ? "revoked" : refreshStatus;
    const mayInstall = status === "current" || status === "stale";

    return {
      id: app.id,
      slug,
      status,
      publisher: {
        identity: publisherIdentity(app.provenance),
        evidence: app.provenance.releaseSource.sourceUrl,
      },
      sandbox: { sha256: sandboxPolicyHash(app.sandbox), policy: app.sandbox },
      release: release
        ? {
            version: release.version,
            publishedAt: release.publishedAt,
            artifacts: release.artifacts.map(({ architecture, url, size, sha256, inspection }) => ({
              architecture,
              url,
              size,
              sha256,
              inspection: inspection ?? null,
              installable: Boolean(inspection) && mayInstall && !revoked.has(sha256),
            })),
          }
        : null,
    };
  });

  return trustedCatalogSchema.parse({ version: 1, ...snapshot, apps });
}
