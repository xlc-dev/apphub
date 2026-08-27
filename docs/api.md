# API

AppHub exposes a read-only static JSON API under `/api/v1`. It has no authentication, mutation API,
runtime database, or server-side queries. The API is pre-release despite the current path; its
schema may change until AppHub 1.0.

## Endpoints

| Endpoint                                                | Response                              |
| ------------------------------------------------------- | ------------------------------------- |
| `/api/v1/meta.json`                                     | Snapshot, freshness, and counts       |
| `/api/v1/apps.json`                                     | First application-summary page        |
| `/api/v1/apps/page/{page}.json`                         | Additional application-summary page   |
| `/api/v1/apps/{id}.json`                                | Application detail and latest release |
| `/api/v1/categories.json`                               | Non-empty categories                  |
| `/api/v1/categories/{id}.json`                          | First category-result page            |
| `/api/v1/categories/{id}/page/{page}.json`              | Additional category-result page       |
| `/api/v1/architectures.json`                            | Available architectures               |
| `/api/v1/architectures/{architecture}.json`             | First architecture-result page        |
| `/api/v1/architectures/{architecture}/page/{page}.json` | Additional architecture-result page   |
| `/api/v1/new.json`                                      | First recently-added page             |
| `/api/v1/new/page/{page}.json`                          | Additional recently-added page        |
| `/api/v1/updated.json`                                  | First latest-release page             |
| `/api/v1/updated/page/{page}.json`                      | Additional latest-release page        |
| `/api/v1/trending/{period}.json`                        | First download-ranking page           |
| `/api/v1/trending/{period}/page/{page}.json`            | Additional download-ranking page      |

Application endpoints use stable AppStream IDs. Ranking periods are `week`, `month`, and `all-time`.
All paths are static. The endpoint table omits the deployment base; the current GitHub Pages build
prefixes these paths with `/apphub`. URLs returned by the API include the active deployment base.

## Snapshots and freshness

Every generated data resource contains the same `revision` and `generatedAt` values:

```json
{
  "version": "v1",
  "revision": "d7b8...",
  "generatedAt": "2026-08-26T15:00:00.000Z",
  "freshness": {
    "downloadsUpdatedAt": "2026-08-26",
    "staleResources": 2,
    "statuses": { "current": 118, "stale": 1, "unavailable": 1, "quarantined": 0 },
    "incidents": { "network": 1, "rateLimit": 0, "notFound": 1, "invalidData": 0, "integrity": 0 }
  },
  "counts": { "apps": 120, "categories": 28, "architectures": 2 }
}
```

`revision` is a deterministic SHA-256 digest of the catalog snapshot, independent of its deployment
base path. Consumers fetching multiple pages can compare it to detect responses from different
snapshots. `generatedAt` records when that catalog revision was created and remains unchanged when
the same snapshot is rebuilt. `downloadsUpdatedAt` is the statistics snapshot date and is `null`
until one exists. A release's `publishedAt` is publication metadata, not an upstream-check
timestamp. `staleResources` counts metadata, releases, download totals, and star counts whose last
successful refresh exceeds their configured threshold. Status and incident counts summarize the same
snapshot.

## Pagination

Every unbounded collection uses pages of 50 items:

```json
{
  "revision": "d7b8...",
  "generatedAt": "2026-08-26T15:00:00.000Z",
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 120,
    "totalPages": 3,
    "previous": null,
    "next": "/apphub/api/v1/apps/page/2.json"
  },
  "items": []
}
```

Filtered collections additionally contain `filter`, and the new-app collection contains
`windowDays`. Rankings contain `period`. A ranking has `pagination: null` and `items: null` when
there is not enough download history to calculate it.

The updated collection contains every listed app with a release, ordered by that release's
publication time. It is not limited to a moving recent-date window.

## Application summaries

Collections contain compact summaries rather than descriptions, screenshots, sandbox rules, or
artifacts. Summary fields include:

- AppStream `id`, current website `slug`, `name`, and `summary`
- Reviewed `origin`, `projectLicense`, and `categories`
- Hosted `icon`, API `url`, and website `webUrl`
- Statistics
- Data status: `current`, `stale`, `unavailable`, or `quarantined`
- Latest release version, publication date, and normalized architectures

`latestRelease` is `null` when no release is recorded. Its architecture list is intended for
filtering; installable artifacts remain in the application detail resource.

## Application details

`/api/v1/apps/{id}.json` wraps the application in `app` alongside its snapshot fields. The app
contains its description, screenshots, sandbox policy, metadata, statistics, and `latestRelease`.
`latestRelease` contains the current artifacts, their sizes, and SHA-256 hashes calculated by
AppHub. `checksumEvidence` identifies where the same checksum was published upstream without
duplicating its value. Signature links remain separate. The application also exposes
machine-readable source and provider identities for its metadata, media, releases, and artifacts.
Its provenance and statistics contain refresh attempts, successes, and current incidents. Downloads
are paused for `quarantined` and `unavailable` apps.

The AppStream `id` identifies the application independently of its current website slug. Before
AppHub 1.0, renamed slugs and removed applications do not leave redirects or compatibility
resources.

Historical releases are not part of API v1. AppHub retains only the information needed to discover
and install the latest supported release through this API.

The application contains one default metadata copy plus an optional `translations` object keyed by
locale. Only translated text is repeated; releases, artifacts, checksums, sandbox rules, and other
locale-independent data remain shared. Website clients use exact locale, then language, then the
default AppStream value as their fallback chain. Collection summaries remain in the default locale;
locale-specific website search indexes provide localized discovery without duplicating the API.

Optional fields are omitted when absent. Statistics values are `null` when AppHub has no applicable
measurement; this does not mean zero. See [Catalog](catalog.md) for catalog-field and sandbox
semantics.

## Categories and architectures

The category and architecture indexes contain their IDs, app counts, and canonical resource URLs.
Category entries also contain their display name, website slug, and website URL. These small
taxonomy indexes are bounded by build-time resource-size limits.

Their detail endpoints are paginated summary collections. Architecture membership means the latest
release has an artifact for that architecture.

## Validation and limits

Builds validate every generated resource against the API schemas and enforce serialized-size
budgets:

- Collection page: 128 KiB
- Application detail: 128 KiB
- Metadata: 16 KiB
- Search index: 512 KiB

Contract tests pin the current envelope and field names so schema, implementation, fixtures, and
documentation change together.
