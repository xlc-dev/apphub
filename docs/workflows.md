# GitHub Actions workflows

AppHub uses GitHub Actions for validation, pull request previews, generated catalog maintenance, and
production deployment. Every JavaScript job uses Bun with the committed lockfile and a frozen
install.

## Continuous integration

The `CI` workflow runs for pull requests. Concurrent runs for the same pull request cancel older
in-progress runs. Branch pushes are not validated separately because they would duplicate the pull
request run.

The workflow:

1. Rejects contributor changes under `.generated/`.
2. Generates only applications whose manifest changed. Changes to the generator or its schemas
   regenerate the complete catalog.
3. Checks formatting and runs the test suite with Bun.
4. Runs Astro and TypeScript diagnostics.
5. Builds the static site at its production `/apphub` path from the generated catalog.
6. Validates manifests, releases, images, download history, repository-star data, and generated
   internal URLs.

The job has read-only repository access. Generated files created during validation are temporary and
are never committed from a pull request.

Contributor-controlled network requests accept only HTTPS destinations resolving exclusively to
public addresses. Each connection is pinned to those validated addresses. Redirect destinations are
validated and pinned again, and cross-origin redirects discard all caller-provided headers.
Response, artifact, release, request, and job limits bound runner use. Pull-request generation does
not receive a GitHub API token.

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
refreshes the complete application catalog. Monday through Saturday refreshes update releases,
download statistics, and repository-star counts. Sunday and manual refreshes also update every
application's AppStream metadata and media.

Download totals never decrease. The updater records at most one snapshot per UTC date and retains
the latest 40 snapshots. Weekly and monthly rankings compare dated snapshots; all-time rankings use
the latest totals. Refresh work uses bounded application and per-host concurrency. Saved HTTP
validators avoid downloading unchanged resources where the source safely supports them. A failed
request retains the previous value when available, while an exhausted provider is paused without
blocking unrelated providers.

Scheduled refreshes isolate metadata and media, releases, downloads, and stars per application.
Transient failures retain the committed last-known-good value and record a machine-readable
incident. Due intervals prevent unchanged sources from being fetched on every scheduled run; manual
runs can force a complete refresh. New apps and source changes remain strict. See
[Refresh failures and freshness](freshness.md) for thresholds, quarantine behavior, and retries.

Each scheduled or manual refresh writes an ephemeral JSON report and the same concise summary to the
GitHub Actions job summary. It includes app status and incident counts, stale resources, persistent
failures, rate-limited providers, catalog revision changes, and refresh network use. The JSON report
is retained as a workflow artifact for 30 days and is not committed to the repository.

New quarantines, newly unavailable apps, and failures reaching three consecutive attempts mark the
workflow unsuccessful after deployment so a transient problem does not block an otherwise valid
catalog update. Existing incidents remain reported without producing the same alert on every run.

The workflow validates the generated catalog and creates at most one commit under `.generated/`. It
does nothing when the generated data is unchanged. The committed snapshot revision and generation
time change only when durable catalog state changes. The workflow then builds the site from that
exact data, validates the built API, locales, security policy, size, URLs, sitemap, and robots file,
updates the production content on `gh-pages` while preserving active previews, uploads the Pages
artifact, and deploys it.

Generated icons and screenshots are bounded WebP files addressed by their content hash. Media is
served from the deployed repository rather than from upstream URLs, and identical files are stored
only once. Validation rejects an app above its normalized media budget and rejects a complete site
above 850 MiB.

Production uses `/apphub` as its base path. The deployed site contains only static HTML, JSON,
JavaScript, styles, and catalog assets; it has no runtime server or database.

Canonical, hreflang, sitemap, and robots URLs derive from `SITE_URL` and `BASE_PATH`; changing to a
custom domain does not require changing page code. The production sitemap contains indexable
canonical pages directly. Later listing pages are `noindex,follow`, while quarantined applications
remain available by direct URL without being indexed.
