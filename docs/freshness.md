# Refresh failures and freshness

AppHub keeps the last generated data that passed validation. It does not maintain a second backup
catalog: the committed generated catalog is the last-known-good copy.

## Refresh units

Each established app refreshes independently. Metadata and media, releases, download totals, and
repository stars are separate units, so a statistics outage does not discard a new release and one
broken app does not block unrelated apps.

Each refreshable unit records `lastAttemptAt`, `lastSuccessAt`, and, after a failure, an incident
category and consecutive-failure count. `lastSuccessAt` is omitted until the unit first succeeds.
Freshness is derived from `lastSuccessAt`:

- Releases become stale after 3 days.
- Download totals and repository stars become stale after 7 days.
- Metadata and media become stale after 30 days.

Incident categories are `network`, `rate-limit`, `not-found`, `invalid-data`, and `integrity`.
Timeouts, rate limits, and server errors are retried twice before the previous value is retained.
`Retry-After` is honored up to 30 seconds.

Scheduled refreshes derive their due time from these timestamps rather than storing another field.
Releases and statistics are due after 20 hours, while metadata and media are due after 7 days. A
failed unit is due again after 6 hours. Manual workflow runs and `FORCE_REFRESH=1` bypass the due
check.

Application work uses four workers. Network requests are limited separately to eight in total and
three per host, with tighter two-request limits for the main catalog providers. A rate-limited host
is paused without blocking other hosts. Safe metadata, feed, and media requests retain ETag or
Last-Modified validators internally and reuse the previous file after a `304 Not Modified` response.
These HTTP cache validators are implementation details and are not published through the API.

## Failure behavior

New apps and reviewed source changes fail closed: generation must reach and validate the configured
sources before the change can enter the catalog. Scheduled refreshes for established apps fail soft
and continue serving the last-known-good data.

Ordinary outages and invalid responses do not remove an app. An integrity or provider-identity
change quarantines the affected app and pauses its downloads. Three consecutive `not-found` release
failures mark downloads unavailable. Neither state deletes the listing automatically; a source
change or removal requires a reviewed pull request.

Application resources expose their overall status and the underlying refresh records. API metadata
also exposes aggregate stale-resource, status, and incident counts.

Refresh jobs stage application data before replacing the generated catalog. Statistics JSON files
are written to temporary files and renamed only after serialization succeeds. The static site and
all API pages are then built from that single generated snapshot.

Each refresh command reports elapsed time and consumed request bytes per host. Catalog validation
also enforces the per-app normalized media budget, while project validation enforces the complete
published-site size budget. Refresh request budgets and catalog sharding remain deferred until
measured catalog growth requires them.

## Human intervention

Transient network, rate-limit, and invalid-data failures need no immediate action. Scheduled runs
keep the last-known-good value and include the incident in their refresh report.

A maintainer reviews a newly quarantined or unavailable app, or an app reaching three consecutive
failures. Integrity, provider identity, ownership, and source changes require a reviewed catalog
change before AppHub accepts the new data. A persistently missing release may require a source
change or removal. Trust policy and schema changes also require a reviewed pull request.

Alerts are transition-based. An unresolved incident remains visible in later reports without failing
every scheduled run again.
