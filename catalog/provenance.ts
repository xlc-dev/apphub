import {
  catalogProvenanceSchema,
  type Artifact,
  type CatalogProvenance,
  type ReleaseLock,
} from "#catalog/schema";
import { RefreshError } from "#catalog/refresh";

type Release = ReleaseLock["releases"][number];

interface ObservedReleaseSource {
  provider: CatalogProvenance["releaseSource"]["provider"];
  projectId?: string;
  ownerId?: string;
  sourceUrl: string;
  validator?: CatalogProvenance["releaseSource"]["validator"];
}

function sameIdentity(recorded: string | undefined, observed: string | undefined) {
  return recorded === undefined || recorded === observed;
}

export function mergeReleaseSource(
  recorded: CatalogProvenance["releaseSource"],
  observed: ObservedReleaseSource
) {
  if (recorded.provider !== observed.provider) {
    throw new RefreshError("integrity", "Release provider changed without a manifest update");
  }

  if (!sameIdentity(recorded.projectId, observed.projectId)) {
    throw new RefreshError("integrity", "Release project identity changed");
  }

  if (!sameIdentity(recorded.ownerId, observed.ownerId)) {
    throw new RefreshError("integrity", "Release source ownership changed");
  }

  const hasDurableIdentity = Boolean(observed.projectId && observed.ownerId);

  if (!hasDurableIdentity && recorded.sourceUrl !== observed.sourceUrl) {
    throw new RefreshError(
      "integrity",
      "Release source URL changed without durable provider identity"
    );
  }

  return catalogProvenanceSchema.shape.releaseSource.parse({
    ...recorded,
    ...observed,
  });
}

function preserveEvidence(recorded: Artifact, observed: Artifact) {
  const artifact = { ...observed };

  if (!artifact.checksumEvidence && recorded.checksumEvidence) {
    artifact.checksumEvidence = recorded.checksumEvidence;
  }

  if (!artifact.signatures && recorded.signatures) {
    artifact.signatures = recorded.signatures;
  }

  return artifact;
}

function verifyRelease(recorded: Release, observed: Release) {
  if (recorded.publishedAt !== observed.publishedAt) {
    throw new RefreshError("integrity", `${recorded.version}: published release metadata changed`);
  }

  if (!sameIdentity(recorded.releaseId, observed.releaseId)) {
    throw new RefreshError("integrity", `${recorded.version}: release identity changed`);
  }

  if (recorded.artifacts.length !== observed.artifacts.length) {
    throw new RefreshError("integrity", `${recorded.version}: published artifacts changed`);
  }
}

function verifyArtifact(release: string, recorded: Artifact, observed: Artifact): Artifact {
  if (
    recorded.name !== observed.name ||
    recorded.size !== observed.size ||
    recorded.sha256 !== observed.sha256 ||
    !sameIdentity(recorded.assetId, observed.assetId)
  ) {
    throw new RefreshError("integrity", `${release}: published artifact changed`);
  }

  return preserveEvidence(recorded, observed);
}

export function reconcileRelease(recorded: Release | undefined, observed: Release) {
  if (recorded?.version !== observed.version) return observed;

  verifyRelease(recorded, observed);

  return {
    ...observed,
    artifacts: observed.artifacts.map((artifact) => {
      const existing = recorded.artifacts.find(
        ({ architecture }) => architecture === artifact.architecture
      );

      if (!existing) {
        throw new RefreshError("integrity", `${observed.version}: published artifact changed`);
      }

      return verifyArtifact(observed.version, existing, artifact);
    }),
  };
}
