# Refresh failures and freshness

AppHub keeps serving the last generated data that passed validation. The committed `.generated/`
directory is that last-known-good copy.

## Refresh units

Each app refreshes independently. Metadata, releases, download totals, and repository stars also
refresh separately. One failed source does not block unrelated data.

Each refreshable unit records `lastAttemptAt`, `lastSuccessAt`, and, after a failure, an incident
category and consecutive-failure count. `lastSuccessAt` is omitted until the unit first succeeds.
Freshness is derived from `lastSuccessAt`:

- Releases become stale after 3 days.
- Download totals and repository stars become stale after 7 days.
- Metadata and media become stale after 30 days.

Incident categories are `network`, `rate-limit`, `not-found`, `invalid-data`, and `integrity`.
Temporary failures are retried before AppHub keeps the previous value.

Scheduled jobs avoid refreshing data before it is due. Failed data is retried sooner. Manual jobs
can force a full refresh. AppHub limits simultaneous requests, and a rate-limited provider is paused
without blocking other providers.

## Failure behavior

New apps and source changes must be downloaded and validated before they enter the catalog.
Scheduled refreshes for existing apps keep the last-known-good data when a source fails.

Ordinary outages and invalid responses do not remove an app. An integrity or provider-identity
change quarantines the affected app and pauses its downloads. Three consecutive `not-found` release
failures mark downloads unavailable. Neither state deletes the listing automatically. A source
change or removal requires a reviewed pull request.

The API exposes app status, refresh records, and summary counts.

Refresh jobs finish and validate new data before replacing the generated catalog. The website and
API are built from one complete snapshot.

## Human intervention

Temporary network, rate-limit, and invalid-data failures need no immediate action. They remain in
the refresh report while AppHub keeps the previous value.

A maintainer reviews newly quarantined or unavailable apps. Integrity, identity, ownership, and
source changes need a reviewed catalog change. A release that remains missing may need a new source
or removal.

Alerts are transition-based. An unresolved incident remains visible in later reports without failing
every scheduled run again.
