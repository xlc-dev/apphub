# Catalog signing

AppHub uses a small TUF repository under `/api/v1/tuf/`. The root role is offline. Targets,
snapshot, timestamp, and revocation roles use separate Ed25519 keys.

## Initial setup

Run `create-tuf-root` on a trusted offline machine and give it an absolute directory outside the
repository. The command refuses to place private keys inside the checkout. It creates:

- `trust/root.json`, containing the self-signed public root;
- `trust/revocations.json` and `revocations.json`, containing the initial empty revocation state;
- one private PEM for each role in the external directory.

Store the targets, snapshot, and timestamp PEMs as repository Actions secrets named
`APPHUB_TUF_TARGETS_KEY`, `APPHUB_TUF_SNAPSHOT_KEY`, and `APPHUB_TUF_TIMESTAMP_KEY`. Store the
revocation PEM as the `APPHUB_TUF_REVOCATIONS_KEY` secret in the `catalog-revocation` environment.
Keep the root PEM offline.

Keep the revocation key in the `catalog-revocation` environment so only that workflow receives it.
For this single-maintainer repository, do not configure an approval count the maintainer cannot
satisfy. Protect `main` by requiring human source changes to arrive through pull requests, and allow
only the publication GitHub App to bypass that rule for its generated-state commits. Configure every
signing secret before enabling production publication. Production always generates and validates
signed metadata; there is no unsigned deployment mode. Missing keys, missing trust metadata, or
invalid signatures fail the workflow.

Enable immutable releases in the repository settings before publishing media. AppHub uploads
complete content-addressed draft releases and only then publishes them, allowing GitHub to lock
their tags and assets permanently.

## Publication

Every successful refresh writes a signed catalog target, versioned targets and snapshot metadata,
and a short-lived timestamp. All files are committed under `.generated/tuf/` and served by the
static Pages build. Validation follows the complete timestamp to snapshot to targets to catalog hash
chain and compares the signed catalog with the reviewed source state before publication.

The signed catalog includes only the current release record. Each artifact entry includes its URL,
architecture, size, SHA-256, inspection evidence, and `installable` decision. The surrounding app
entry binds that decision to the publisher identity, complete sandbox policy, and lifecycle status.

## Revocation

The revocation workflow only appends a SHA-256 and public reason. It cannot approve or replace an
artifact. Its result is available immediately from the raw GitHub URL for `trust/revocations.json`;
Pages also includes the latest copy. A scheduled monthly run renews the 45-day document before
expiry, including across 31-day months.

## Rotation

Root updates must increment the root version by exactly one and carry signatures satisfying both the
old and new root roles. AppHub's verifier enforces both thresholds. Online role keys are rotated by
publishing such a root update, replacing the corresponding Actions secret, and generating fresh
metadata with the new key. Never delete the previous offline root material until clients have
accepted the replacement root.
