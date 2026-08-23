# GitHub Actions workflows

AppHub uses GitHub Actions for validation, pull request previews, generated catalog maintenance, and
production deployment. Every JavaScript job uses Bun with the committed lockfile and a frozen
install.

## Continuous integration

The `CI` workflow runs for pull requests and pushes to branches other than `main`. Concurrent runs
for the same reference cancel older in-progress runs.

The workflow:

1. Rejects contributor changes under `.generated/`.
2. Generates only applications whose `app.json` changed. Changes to the generator or its schemas
   regenerate the complete catalog.
3. Checks formatting and runs the test suite.
4. Runs Astro and TypeScript diagnostics.
5. Builds the static site from the generated catalog.
6. Validates manifests, releases, images, download history, and repository-star data.

The job has read-only repository access. Generated files created during validation are temporary and
are never committed from a pull request.

## Pull request previews

Pull requests originating from this repository receive a static preview. The preview workflow:

1. Generates changed applications and builds the pull request with a commit-specific base path.
2. Builds the target production revision.
3. Publishes the preview under its commit SHA on the `gh-pages` branch.
4. Preserves other active previews while updating production content when necessary.
5. Removes the preview when the pull request closes.

Forked pull requests do not receive previews because deployment requires write access. Preview and
production deployments share a concurrency group so only one workflow modifies `gh-pages` at a time.

## Catalog refresh and production deployment

The `Deploy GitHub Pages` workflow runs on pushes to `main`, daily at 04:07 UTC, and on manual
dispatch.

On a main-branch push, it refreshes changed applications. A change to the generator or its schemas
refreshes the complete application catalog. Scheduled and manual runs refresh every application,
download statistics, and repository-star counts.

Download totals never decrease. The updater records at most one snapshot per UTC date and retains
the latest 40 snapshots. Weekly and monthly rankings compare dated snapshots; all-time rankings use
the latest totals. A failed repository-star request retains the previous count when available.

The workflow validates the generated catalog and creates at most one commit under `.generated/`. It
does nothing when the generated data is unchanged. It then builds the site from that exact data,
updates the production content on `gh-pages` while preserving active previews, uploads the Pages
artifact, and deploys it.

Production uses `/apphub` as its base path. The deployed site contains only static HTML, JSON,
JavaScript, styles, and catalog assets; it has no runtime server or database.
