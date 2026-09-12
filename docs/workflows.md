# GitHub Actions workflows

GitHub Actions validates pull requests, builds previews, refreshes the catalog, and deploys the
website. Every JavaScript job uses Bun and the committed lockfile.

## Continuous integration

The `CI` workflow runs for pull requests. A newer run cancels an older run for the same pull
request.

The workflow:

1. Rejects contributor changes under `.generated/`.
2. Generates changed apps, or the full catalog when shared generation code changes.
3. Checks formatting and runs the test suite with Bun.
4. Runs Astro and TypeScript diagnostics.
5. Builds the static site at its production `/apphub` path from the generated catalog.
6. Validates the catalog and built website.

The job has read-only repository access. It never commits generated pull-request data.

Remote data must pass the checks in [Security](security.md). Pull-request generation receives no
GitHub API token.

## Pull request previews

Pull requests originating from this repository receive a static preview artifact. The preview
workflow:

1. Generates changed apps and builds the pull request at the production base path.
2. Validates the complete static output.
3. Uploads it as a seven-day workflow artifact named with the commit SHA.

Forked pull requests do not receive previews because their remote inputs are untrusted. Preview
artifacts are not deployed or combined with production, so they cannot consume the production Pages
size budget. Production HTML and generated media are never committed to `gh-pages`.

## Catalog refresh and production deployment

The `Refresh catalog` workflow runs daily and can be started manually. It deterministically plans
batches of at most 50 applications and runs at most 12 unprivileged workers concurrently. A
credentialed finalizer requires every planned result, validates the complete merged state, retains
last-known-good data for isolated source failures, and publishes only a complete snapshot.

The `Deploy GitHub Pages` workflow runs after source pushes. A catalog refresh builds and uploads
the changed site from its validated finalizer workspace, then deploys it in a dependent job. A
refresh does not finish successfully unless its changed catalog is built, validated, uploaded, and
deployed successfully.

After a source push, Pages refreshes changed apps before deployment; shared generator changes
refresh the full catalog. Daily refresh jobs update every due resource and statistics. Manual
refreshes force all application resources through the batch pipeline.

Download totals never decrease. AppHub keeps the latest 40 daily snapshots for rankings. AppHub
limits simultaneous requests and reuses unchanged responses when possible. A failed source keeps its
previous value without blocking other providers.

Metadata, releases, downloads, and stars refresh separately for each app. Temporary failures keep
the last-known-good value and record an incident. Manual runs can force a full refresh. New apps and
source changes must still succeed before they are accepted. See
[Refresh failures and freshness](freshness.md) for thresholds, quarantine behavior, and retries.

Each refresh writes a summary and a JSON report. The report is kept as a workflow artifact for 30
days and is not committed. The workflow locates its catalog maintenance issue by a fixed marker and
the `catalog-maintenance` label, so an unrelated issue with the same title is never modified. Daily
runs update the issue body without commenting. A stable fingerprint creates a comment only when the
actionable set or its severity changes, including new, recovered, escalated, quarantined,
unavailable, and revoked items. After 100 change comments, automation closes the issue and links it
to a new successor. It closes the active issue after all actionable conditions recover.

Catalog incidents do not fail an otherwise safe deployment. Failure to refresh, validate, deploy, or
update the maintenance issue does fail the workflow.

The workflow assigns every active maintenance issue to `xlc-dev` so GitHub sends a notification and
keeps the incident in that account's assigned-issues queue. The `MAINTENANCE_ASSIGNEE` repository
Actions variable can select a different maintainer without changing the workflow.

The refresh workflow creates at most one generated-state commit. Generated media is ignored and is
never added to that commit. Pages uploads production directly as a GitHub Pages artifact and never
reads or writes the `gh-pages` branch.

Generated media is published as immutable GitHub Release assets. New media is placed into
content-addressed batches of at most 900 assets. Each release remains a draft until every planned
asset is present with GitHub's matching SHA-256 digest; publishing then lets GitHub lock the
release. The committed `media-map.json` records the immutable tag for each content hash. The
publisher rechecks local bytes, rejects mapping collisions and unexpected assets, and never replaces
a published asset. Release immutability must remain enabled; publication fails when GitHub does not
confirm that setting.

Actions artifacts remain temporary worker inputs and audit reports; they are not durable catalog
storage. Production publishes media before building. Every site build, including a local build,
resolves media from the committed map and immutable Release URLs.

The publication GitHub App needs repository `Contents: write` and `Administration: read` access. The
latter is used only to fail closed unless GitHub confirms that immutable releases are enabled.

Production uses `/apphub` as its base path. The deployed site contains only static HTML, JSON,
JavaScript, styles, and catalog assets. It has no runtime server or database.

## Signed catalog and emergency revocation

Every production publication signs a catalog target with separate online targets, snapshot, and
timestamp keys. The signed target binds each artifact hash and architecture to its publisher
identity, exact sandbox policy, lifecycle state, and installation decision. Root trust is generated
offline with `create-tuf-root`; private keys must never be stored in the repository. There is no
production switch for unsigned metadata: missing keys or failed validation stop publication.

The `Revoke AppImage` workflow can only append a hash and public reason to the revocation list. It
uses the restricted `catalog-revocation` environment and publishes the signed document directly in
`trust/revocations.json`. Clients can fetch that file through the raw GitHub content URL without
waiting for a Pages deployment. It also requires the updated website to deploy successfully so
AppHub removes its own download controls for the revoked release. A monthly run renews the
document's expiry.

Canonical, language, sitemap, and robots URLs use `SITE_URL` and `BASE_PATH`. Later listing pages
and quarantined apps are not indexed.
