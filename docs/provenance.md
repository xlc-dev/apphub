# Origin and provenance

AppHub records where catalog data and downloadable AppImages came from. It does not assign a safety
or trust score.

## Origin

Every app has one reviewed AppImage origin:

- `upstream`: the upstream project publishes the exact AppImage source in its own repository, or
  explicitly links to it from a project-controlled page.
- `third-party`: someone else builds or publishes the AppImage.

An upstream claim needs an evidence URL reviewed in the catalog pull request. It does not mean
AppHub controls or audits the upstream project.

The pull request records who submitted the listing. That person is not necessarily the app developer
or AppImage publisher.

## Recorded provenance

Generated data records where metadata, media, releases, and files came from. This can include:

- Provider and source URL.
- Project, owner, release, and asset IDs.
- Last refresh attempt and success times for generated sources.
- One SHA-256 calculated by AppHub from downloaded bytes.
- The source of a matching upstream checksum, when one is published.
- Signatures published by the source.

AppHub compares published SHA-256 hashes with its own. A mismatch fails generation. Signature URLs
are kept as evidence, but AppHub does not verify those signatures.

Repository renames are accepted when the provider's project and owner IDs stay the same. Transfers,
identity changes, feed URL changes, or changed bytes quarantine the update. Moving to a new source
needs a reviewed manifest change. Ordinary outages keep the last-known-good data. See
[Refresh failures and freshness](freshness.md) for the complete policy.

## Guarantees and limits

AppHub guarantees only that the catalog passed its validation and that its SHA-256 identifies the
bytes downloaded during the recorded refresh.

AppHub does not guarantee that an application or AppImage is safe, malware-free, audited, correctly
sandboxed, endorsed by its upstream project, or unchanged after the recorded observation. An
`upstream` origin is a provenance statement, not a security certification. Users must still decide
whether they trust the project, publisher, release source, and requested host access.
