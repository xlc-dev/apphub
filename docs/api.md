# API

AppHub exposes a read-only JSON API under `/api/v1`. The API and website are generated from the same
validated catalog during the static build. There is no authentication, mutation API, or runtime
database.

All endpoints are pre-rendered JSON documents. Consumers should treat the versioned response
structures as stable within `v1`, while allowing new catalog entries and releases to appear at any
time.

## Endpoints

| Endpoint                         | Response                                             |
| -------------------------------- | ---------------------------------------------------- |
| `/api/v1/apps.json`              | All applications, ordered by name                    |
| `/api/v1/apps/{slug}.json`       | One application                                      |
| `/api/v1/categories.json`        | All non-empty categories                             |
| `/api/v1/categories/{slug}.json` | One category and its applications                    |
| `/api/v1/new.json`               | Applications added within the current new-app window |
| `/api/v1/trending/week.json`     | Download ranking for the last seven days             |
| `/api/v1/trending/month.json`    | Download ranking for the last 30 days                |
| `/api/v1/trending/all-time.json` | Latest recorded cumulative download ranking          |

Slugs come from generated API data; application IDs and category IDs are not interchangeable with
slugs.

## Application

The application collection is an array of application objects. The single-application endpoint
returns the same object directly:

```json
{
  "id": "org.example.App",
  "slug": "example-app",
  "name": "Example App",
  "summary": "A short description of the application",
  "description": "A longer plain-text description.",
  "projectLicense": "MIT",
  "developer": {
    "name": "Example Developers",
    "url": "https://example.org/"
  },
  "homepage": "https://example.org/",
  "repository": "https://github.com/example/app",
  "addedAt": "2026-08-20",
  "keywords": ["example"],
  "categories": ["Utility"],
  "mimeTypes": ["application/example"],
  "source": "official",
  "icon": {
    "license": "CC0-1.0",
    "source": "https://example.org/icon.png",
    "url": "/assets/example-icon.hash.webp",
    "type": "image/webp"
  },
  "screenshots": [
    {
      "caption": "Main window",
      "license": "CC0-1.0",
      "source": "https://example.org/screenshot.png",
      "url": "/assets/example-screenshot.hash.webp",
      "type": "image/webp"
    }
  ],
  "sandbox": {
    "network": "client",
    "display": "wayland",
    "audio": "playback",
    "processes": "isolated",
    "ipc": false,
    "filesystem": [],
    "devices": ["gpu"],
    "portals": ["file-chooser", "open-uri"],
    "sessionBus": [],
    "systemBus": []
  },
  "releases": [
    {
      "version": "1.0.0",
      "publishedAt": "2026-08-20T12:00:00Z",
      "page": "https://example.org/releases/1.0.0",
      "artifacts": [
        {
          "architecture": "x86_64",
          "name": "Example-1.0.0-x86_64.AppImage",
          "url": "https://example.org/Example-1.0.0-x86_64.AppImage",
          "size": 12345678,
          "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      ]
    }
  ]
}
```

Optional manifest fields are omitted when absent. Deprecated applications may include
`deprecated: true` and `replacedBy`. Internal catalog fields used to locate release sources and
match upstream assets are never exposed.

Image `url` values point to files generated and served by AppHub. Artifact `url` values point to
upstream publishers. `type` is one of `image/avif`, `image/jpeg`, `image/png`, or `image/webp`.

For the full meaning and allowed values of catalog fields, see [Catalog](catalog.md).

## Categories

The category collection contains only categories used by at least one application:

```json
[
  {
    "id": "AudioVideo",
    "name": "Audio Video",
    "slug": "audio-video",
    "count": 4
  }
]
```

`id` is the Freedesktop category identifier, `name` is its display label, and `slug` is its URL-safe
identifier. Categories are ordered by display name.

The category detail endpoint omits `count` and embeds its matching applications:

```json
{
  "id": "AudioVideo",
  "name": "Audio Video",
  "slug": "audio-video",
  "apps": []
}
```

Each entry in `apps` has the complete application structure described above.

## New applications

The new-app endpoint returns the configured window and applications whose `addedAt` date falls
within it:

```json
{
  "windowDays": 30,
  "apps": []
}
```

Applications are ordered by addition date, newest first. Future dates are excluded. Consumers should
use `windowDays` from the response rather than assuming a fixed duration.

## Rankings

Ranking endpoints return the requested period and either an ordered list of entries or `null`:

```json
{
  "period": "week",
  "entries": [
    {
      "app": {},
      "downloads": 120
    }
  ]
}
```

`period` is `week`, `month`, or `all-time`. Each `app` is a complete application object. Entries are
ordered by downloads descending, then by application name.

An empty array means download history exists but no applications have counts for that ranking.
`null` means there is not enough stored history to calculate the requested period. Weekly and
monthly counts are differences between cumulative upstream totals; all-time counts are the latest
recorded totals.

## Static behavior

Because the API is generated at build time:

- Responses change only when AppHub rebuilds and deploys.
- Unknown application, category, or ranking paths are static 404 responses.
- The API has no pagination; catalog collection endpoints return complete results.
- Asset URLs may include build-generated hashes and should be read from each response.
