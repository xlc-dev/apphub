# Workflows

AppHub is a statically generated site backed by files committed to the repository. Catalog changes,
release discovery, statistics, validation, previews, and production deployment are handled by small
commands and GitHub Actions workflows.

## Local validation

Install the pinned dependency set with:

```sh
bun install --frozen-lockfile
```

Run the complete validation pipeline with:

```sh
bun run validate
```

The pipeline runs, in order:

1. Prettier formatting checks.
2. Astro and TypeScript diagnostics.
3. Bun tests.
4. A production static build.
5. Catalog validation.

Catalog validation parses all manifests, release locks, download history, and repository-star data.
It also rejects missing locks, unexpected files, symbolic links, invalid or oversized images,
unreferenced screenshots, duplicate application IDs, and inconsistent replacement IDs.

Focused commands are available while developing:

| Command                    | Purpose                                |
| -------------------------- | -------------------------------------- |
| `bun test`                 | Run the test suite                     |
| `bun run check`            | Run Astro and TypeScript diagnostics   |
| `bun run format:check`     | Check formatting                       |
| `bun run build`            | Generate the static site and API       |
| `bun run validate:catalog` | Validate catalog files and stored data |

## Updating releases

Run the release updater for the entire catalog:

```sh
bun run update-releases
```

To update one application, pass its directory slug:

```sh
bun run update-releases example-app
```

The updater reads each manifest's release source, retrieves current upstream metadata, selects
matching AppImage assets, and updates `releases.json`. GitHub, GitLab, Codeberg, and JSON feeds are
supported. Direct release sources remain manually maintained.

Published checksums are used when available. Otherwise, a newly discovered artifact is downloaded
once and hashed. Existing recorded artifacts are not downloaded again. The updater validates the
entire proposed history before writing and fails without changing the catalog when a source cannot
be processed.

The `Update releases` GitHub Actions workflow runs daily at 03:17 UTC and can be started manually.
It installs dependencies, updates every release lock, runs complete validation, and opens or updates
the `release-update` pull request with changes under `apps/`. Updates therefore pass through normal
review and CI before reaching the catalog.

## Updating statistics

Download totals and repository stars are stored in `catalog/downloads.json` and
`catalog/stars.json`. Generate them locally with:

```sh
bun run update-downloads
```

```sh
bun run update-stars
```

The download updater reads cumulative totals from supported release sources. Totals never decrease,
which prevents upstream gaps or resets from producing negative rankings. It records at most one
snapshot per UTC date and retains the latest 40 snapshots. Weekly and monthly rankings are derived
from differences between snapshots; all-time rankings use the latest totals.

The star updater reads supported repository hosts. A failed request retains the previous count when
one exists. Star counts are presentation metadata and are keyed by application slug.

The `Update catalog statistics` workflow runs daily at 03:47 UTC and can be started manually. It
updates both files, validates the repository, and commits changed statistics directly to the current
branch. It does nothing when the stored data has not changed.

## Continuous integration

The `CI` workflow runs `bun run validate` for pull requests and for pushes to branches other than
`main`. Concurrent runs for the same reference cancel older in-progress runs. The job has read-only
repository access and a ten-minute timeout.

## Pull request previews

Pull requests originating from this repository receive a static preview. The preview workflow:

1. Builds the pull request with a commit-specific base path.
2. Builds the target production revision.
3. Publishes the preview under its commit SHA on the `gh-pages` branch.
4. Preserves other active previews while updating production content when necessary.
5. Removes the preview when the pull request closes.

Forked pull requests do not receive previews because the deployment requires write access. Preview
deployment shares a concurrency group with production deployment so the `gh-pages` branch is only
modified by one workflow at a time.

## Production deployment

The `Deploy GitHub Pages` workflow runs on pushes to `main`, daily at 04:07 UTC, and on manual
dispatch. The scheduled build refreshes generated pages and API data even when no source file has
changed.

Production is built with `/apphub` as its base path. The workflow updates the root of the `gh-pages`
branch while preserving directories marked as active pull request previews, uploads the complete
branch as a Pages artifact, and deploys it through GitHub Pages.

The site contains no runtime server or database. A deployment publishes HTML, JSON, JavaScript,
styles, and catalog assets produced by the Astro static build.
