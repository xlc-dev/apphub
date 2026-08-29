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

Pull requests originating from this repository receive a static preview. The preview workflow:

1. Generates changed apps and builds the pull request with a commit-specific base path.
2. Builds the target production revision.
3. Publishes the preview under its commit SHA on the `gh-pages` branch.
4. Preserves other active previews while updating production content when necessary.
5. Removes the preview when the pull request closes.

Forked pull requests do not receive previews because deployment needs write access. Only one preview
or production job can update `gh-pages` at a time.

## Catalog refresh and production deployment

The `Deploy GitHub Pages` workflow runs after pushes to `main`, once a day, and when started
manually.

After a push, it refreshes changed apps. Shared generator changes refresh the full catalog. Daily
jobs update releases and statistics. Weekly and manual jobs also update all metadata and media.

Download totals never decrease. AppHub keeps the latest 40 daily snapshots for rankings. AppHub
limits simultaneous requests and reuses unchanged responses when possible. A failed source keeps its
previous value without blocking other providers.

Metadata, releases, downloads, and stars refresh separately for each app. Temporary failures keep
the last-known-good value and record an incident. Manual runs can force a full refresh. New apps and
source changes must still succeed before they are accepted. See
[Refresh failures and freshness](freshness.md) for thresholds, quarantine behavior, and retries.

Each refresh writes a summary and a JSON report. The report is kept as a workflow artifact for 30
days and is not committed.

New quarantines, unavailable apps, and repeated failures make the workflow fail after deployment.
Existing incidents remain visible without sending the same alert every day.

The workflow creates at most one `.generated/` commit and does nothing when data is unchanged. It
then builds and validates the website, updates production on `gh-pages` without removing previews,
and deploys GitHub Pages.

Generated media is served from the deployed repository. Identical files are stored once, and size
limits apply to each app and the complete site.

Production uses `/apphub` as its base path. The deployed site contains only static HTML, JSON,
JavaScript, styles, and catalog assets. It has no runtime server or database.

Canonical, language, sitemap, and robots URLs use `SITE_URL` and `BASE_PATH`. Later listing pages
and quarantined apps are not indexed.
