# Origin and provenance

AppHub records where catalog data and downloadable AppImages came from. It does not assign a safety
or trust score.

## Origin

Every entry has one reviewed AppImage origin:

- `upstream`: the upstream project publishes the exact AppImage source in its own repository, or
  explicitly links to it from a project-controlled page.
- `third-party`: someone else builds or publishes the AppImage.

An upstream claim requires an evidence URL reviewed in the catalog pull request. Git history records
that review. The claim does not mean AppHub continuously controls or audits the upstream project.

The contributor who submits a catalog entry is recorded by the pull request and Git history. This is
separate from the upstream application identity and from the publisher of a particular AppImage.

## Recorded provenance

Generated catalog data records metadata, media, release sources, releases, and artifacts
independently. Depending on the provider, this includes:

- Provider and source URL.
- Project, owner, release, and asset IDs.
- Last refresh attempt and success times for generated sources.
- One SHA-256 calculated by AppHub from downloaded bytes.
- The source of a matching upstream checksum, when one is published.
- Signatures published by the source.

AppHub compares a published SHA-256 with the hash it calculated. Because mismatches fail generation,
the catalog stores the hash once and records the upstream evidence URL separately. It retains
signature URLs as evidence but does not currently verify those signatures.

Repository renames are accepted when the provider's durable project and owner identities remain
stable. Repository transfers, provider identity changes, feed URL changes, and changed bytes at a
recorded asset identity quarantine scheduled updates. Source migrations require an explicit reviewed
manifest change. Ordinary outages retain the last-known-good resource. See
[Refresh failures and freshness](freshness.md) for the complete policy.

## Guarantees and limits

AppHub guarantees only that the published catalog passed its schemas and generation checks, and that
an AppHub-observed SHA-256 identifies the bytes downloaded during the recorded refresh.

AppHub does not guarantee that an application or AppImage is safe, malware-free, audited, correctly
sandboxed, endorsed by its upstream project, or unchanged after the recorded observation. An
`upstream` origin is a provenance statement, not a security certification. Users must still decide
whether they trust the project, publisher, release source, and requested host access.
