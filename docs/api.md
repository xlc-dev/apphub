# API

AppHub provides a read-only JSON API under `/api/v1`. It is made of static files and needs no
authentication.

API v1 is frozen. Existing fields, types, values, and meanings will not change. Changes to an
existing response need a new API version. New endpoints may be added when they do not change an
existing response.

## Endpoints

| Endpoint                                                | Response                              |
| ------------------------------------------------------- | ------------------------------------- |
| `/api/v1/schema.json`                                   | JSON Schema for API v1 responses      |
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

Application endpoints use AppStream IDs. Ranking periods are `week`, `month`, and `all-time`.

The paths above do not include the deployment base. GitHub Pages currently adds `/apphub`. URLs in
API responses already include the active base path.

## Using the API

The GitHub Pages deployment allows browser requests from any origin. A self-hosted deployment must
do the same if third-party websites need to use its API.

There is no server-side search. Clients can download the paginated app summaries and search them
locally. AppHub's website uses a generated `/search-index.json` file for each locale.

API and hosted-media URLs are paths on the AppHub origin. Resolve them against the origin of the
response. Upstream source and download URLs are absolute. `webUrl` points to the AppHub page, but a
client can build its own routes from `id` or `slug`.

`/api/v1/schema.json` uses JSON Schema Draft 2020-12. It describes every API v1 response except the
schema file itself.

## Snapshots and freshness

Every data response includes the same `revision` and `generatedAt` values. `revision` is a SHA-256
digest of the catalog snapshot. Compare it across requests to make sure pages came from the same
snapshot.

`generatedAt` is the time that revision was created. It does not change when the same snapshot is
built again. `downloadsUpdatedAt` is the date of the statistics snapshot, or `null` when none
exists.

`staleResources` counts data that has not refreshed within its configured time limit. Status and
incident counts summarize the same snapshot. A release's `publishedAt` is its publication date, not
the time AppHub checked it.

## Pagination

Collections use pages of 50 items:

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

Filtered collections also contain `filter`. New-app collections contain `windowDays`, and rankings
contain `period`. A ranking has `pagination: null` and `items: null` when there is not enough
history to calculate it.

The updated collection contains every app with a release, ordered by the release publication date.

## Applications

Collection pages contain summaries with identity, origin, categories, statistics, status, and the
latest release. They do not include descriptions, screenshots, sandbox rules, or downloads.
`latestRelease` is `null` when no release is known.

`/api/v1/apps/{id}.json` contains the full app record. This includes descriptions, translations,
screenshots, sandbox permissions, provenance, statistics, and the latest release. Downloads include
their size and the SHA-256 calculated by AppHub. Downloads remain visible for unavailable and
quarantined apps, but clients must not offer them for installation.

API v1 contains only the latest release. It does not provide release history. The AppStream ID is
the app's stable identity. The website slug may change before AppHub 1.0 without a redirect.

Optional fields are left out when absent. A `null` statistic means AppHub has no measurement, not
that the value is zero. See [Catalog](catalog.md) for catalog fields and [Sandbox v1](sandbox.md)
for sandbox permissions.

## Categories and architectures

The category and architecture indexes contain IDs, app counts, and resource URLs. Their detail
endpoints are paginated app summaries. An app belongs to an architecture when its latest release has
a download for that architecture.

## Validation and limits

Every generated response is checked against the API schema. Size limits are:

- Collection page: 128 KiB
- Application detail: 128 KiB
- Metadata: 16 KiB
- JSON Schema: 512 KiB
- Search index: 512 KiB

The public API schema is separate from the internal catalog schema. Catalog changes cannot change
API v1 by accident. Sandbox v1 is also shared and frozen. A different sandbox contract needs a new
sandbox schema and API version.

## Reuse

The API code and schema use AppHub's AGPL license. Responses contain metadata and media that keep
their original rights and licenses. See [Catalog](catalog.md) for details.
