# Client integration

AppHub's website and unsigned API are discovery interfaces. Any installer, package manager, catalog
frontend, or auditing tool can consume them, but installation authority comes from the signed
catalog. The protocol does not depend on a specific client implementation.

## Required verification for installers

An installing client must ship a trusted AppHub root and implement the normal TUF update sequence:
root, timestamp, snapshot, targets, and the catalog target. It must verify signatures, role
thresholds, versions, expiry, referenced lengths and hashes, and prevent rollback and freeze
attacks. Root keys rotate only through a root signed by the currently trusted root and the new root.

Before installing, a client must:

1. Refresh the independently signed revocation document and cache the last valid copy.
2. Refuse a known-revoked SHA-256 even if older catalog metadata still permits it.
3. Refuse installation when required metadata is expired or cannot be verified. A network failure
   may use unexpired cached metadata, but it must not bypass expiry or revocation checks.
4. Resolve the selected app and artifact in the signed catalog. Do not treat a website link, custom
   URL scheme, or unsigned API response as installation authority.
5. Require status `current` or `stale`, `installable: true`, the requested architecture, and an
   exact match for URL, byte size, SHA-256, publisher identity, and sandbox-policy hash.
6. Download to a temporary file, enforce the signed byte limit while streaming, calculate SHA-256,
   and make the file available atomically only after it matches.
7. Apply the exact signed sandbox policy with default-deny semantics. Never fall back to an
   unsandboxed launch when policy setup fails.

Read-only clients that never install or launch an artifact may use the unsigned discovery API. They
should still use its snapshot revision to avoid combining records from different catalog versions.

## Web handoff

The website opens `appimg://install?url=<encoded HTTPS URL>&sha256=<encoded lowercase SHA-256>`.
This handoff is only a selection hint so compatible clients can integrate with a browser. An
installer must locate the same URL and SHA-256 in the verified signed catalog and apply all checks
above; the custom URL alone does not authorize an installation. Other clients may discover and
select artifacts directly from the API without implementing this URL scheme.

Metadata refresh must never execute, mount, or unsafely extract an AppImage. If a client performs
additional archive inspection, it must use a disposable unprivileged worker with strict resource
limits and reject traversal and unsafe links.

## Required rejection tests

An installing client should prove that quarantined, unavailable, revoked, wrong-hash, wrong-size,
wrong-architecture, expired, rolled-back, unsigned, and permission-expanded targets cannot install.
It should also cover a valid cached catalog during a temporary network outage and an emergency
revocation of an otherwise valid cached target.

Until an installer performs these checks, AppHub's signed catalog cannot protect that installer's
downloads or launches.
