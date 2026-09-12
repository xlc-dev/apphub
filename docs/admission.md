# Artifact admission

Merging `apps/<slug>.json` into `main` is AppHub's human approval boundary. The reviewed manifest
chooses the application identity, upstream release source, publisher claim, asset patterns, and
sandbox permissions. There is no separate approval for each ordinary release.

After a manifest is merged, refresh workers automatically accept a newer AppImage only when all of
the following remain true:

- the release comes from the configured source and its durable provider owner and project identities
  have not changed;
- the asset name matches exactly one architecture declared by the reviewed manifest;
- the downloaded byte count and any publisher checksum agree;
- bounded inspection confirms the expected ELF architecture and a structurally valid AppImage
  runtime and archive;
- the SHA-256 and inspection evidence are recorded in the generated release state; and
- the artifact is not revoked.

A normal release may change its version, URL, size, and SHA-256 without human intervention. Those
are observations produced by the trusted refresh workflow, not maintained policy.

Changing the source, publisher declaration, asset patterns, sandbox permissions, or any other
manifest field requires a reviewed pull request. Provider ownership transfer, changed bytes at the
same durable asset identity, checksum disagreement, malformed files, and other integrity failures do
not publish new state. AppHub retains the last-known-good release or quarantines the listing.

Inspection is deliberately structural. Workers never execute, mount, or extract an AppImage, and a
clean result is not a malware audit. “Official” describes verified publisher provenance; it does not
mean “safe” or “audited.”
