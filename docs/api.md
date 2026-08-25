# API

AppHub exposes a read-only JSON API under `/api/v1`. It is generated from the same validated catalog
as the website. There is no authentication, mutation API, runtime database, or pagination.

Responses are static files and change when AppHub rebuilds. Structures remain compatible within
`v1`; catalog entries, releases, statistics, and additive object fields may change between builds.

## Endpoints

| Endpoint                                    | Response                                   |
| ------------------------------------------- | ------------------------------------------ |
| `/api/v1/meta.json`                         | API version, freshness, and catalog counts |
| `/api/v1/apps.json`                         | Complete applications ordered by name      |
| `/api/v1/apps/{id}.json`                    | One application by AppStream ID            |
| `/api/v1/categories.json`                   | Non-empty categories                       |
| `/api/v1/categories/{id}.json`              | One category and application summaries     |
| `/api/v1/architectures.json`                | Architectures with available AppImages     |
| `/api/v1/architectures/{architecture}.json` | One architecture and app summaries         |
| `/api/v1/new.json`                          | Recently added application summaries       |
| `/api/v1/updated.json`                      | Recently released application summaries    |
| `/api/v1/trending/week.json`                | Seven-day download ranking                 |
| `/api/v1/trending/month.json`               | 30-day download ranking                    |
| `/api/v1/trending/all-time.json`            | Latest cumulative download ranking         |

Application endpoints use the stable AppStream ID. The `slug` field is the website path component.
Category endpoints use Freedesktop category IDs.

## Catalog metadata

`/api/v1/meta.json` describes the generated response set:

```json
{
  "version": "v1",
  "generatedAt": "2026-08-24T20:00:00.000Z",
  "downloadsUpdatedAt": "2026-08-24",
  "counts": { "apps": 20, "categories": 8, "architectures": 2 }
}
```

`downloadsUpdatedAt` is `null` until a download snapshot exists. `generatedAt` is the site build
time, not the time every upstream source was last changed.

## Applications

`/api/v1/apps.json` is an array of complete objects. The individual endpoint returns the same
object:

```json
{
  "id": "org.example.App",
  "slug": "example-app",
  "name": "Example App",
  "summary": "A short description",
  "description": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "value": "A longer description." }]
    }
  ],
  "projectLicense": "MIT",
  "developer": { "name": "Example Developers", "url": "https://example.org/" },
  "homepage": "https://example.org/",
  "repository": "https://github.com/example/app",
  "links": {
    "bugtracker": "https://github.com/example/app/issues",
    "donation": "https://example.org/donate"
  },
  "contentRating": {
    "ratingSystem": "ESRB",
    "rating": "Everyone 10+",
    "minimumAge": 10,
    "warnings": ["Mild fantasy violence"]
  },
  "addedAt": "2026-08-20",
  "keywords": ["example"],
  "categories": ["Utility"],
  "mimeTypes": ["application/example"],
  "source": "official",
  "icon": {
    "source": "https://example.org/icon.png",
    "url": "/assets/example-icon.hash.webp",
    "type": "image/webp"
  },
  "screenshots": [
    {
      "caption": "Main window",
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
          "url": "https://example.org/Example.AppImage",
          "size": 12345678,
          "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      ]
    }
  ],
  "url": "/api/v1/apps/org.example.App.json",
  "webUrl": "/apps/example-app/",
  "statistics": {
    "stars": 120,
    "downloads": {
      "updatedAt": "2026-08-24",
      "week": 30,
      "month": 100,
      "allTime": 500
    }
  }
}
```

Optional fields are omitted when absent. Deprecated applications may include `deprecated: true` and
`replacedBy`, which is the stable ID accepted by the application endpoint. Internal source and
asset-matching configuration is not exposed.

`links` may contain `bugtracker`, `help`, `contact`, `donation`, `translate`, `contribute`, and
`faq`. Content ratings retain raw OARS `scheme` and `attributes` when direct AppStream XML supplies
them. Flathub sources provide their localized `ratingSystem`, `rating`, `minimumAge`, and active
`warnings` instead.

Image `url` values are hosted by AppHub. Image `source` and artifact `url` values identify upstream
publisher resources. Statistics values are `null` when AppHub has no applicable measurement; this
does not mean zero. Download periods come from cumulative upstream counts. Repository stars are
available for supported GitHub, GitLab, and Codeberg URLs.

See [Catalog](catalog.md) for catalog-field meanings and sandbox values.

## Application summaries

Category, architecture, new, updated, and ranking responses embed summaries instead of repeating
descriptions, screenshots, sandbox data, and complete release histories:

```json
{
  "id": "org.example.App",
  "slug": "example-app",
  "name": "Example App",
  "summary": "A short description",
  "source": "official",
  "addedAt": "2026-08-20",
  "categories": ["Utility"],
  "icon": {
    "source": "https://example.org/icon.png",
    "url": "/assets/example-icon.hash.webp",
    "type": "image/webp"
  },
  "url": "/api/v1/apps/org.example.App.json",
  "webUrl": "/apps/example-app/",
  "statistics": {
    "stars": 120,
    "downloads": {
      "updatedAt": "2026-08-24",
      "week": 30,
      "month": 100,
      "allTime": 500
    }
  },
  "latestRelease": {
    "version": "1.0.0",
    "publishedAt": "2026-08-20T12:00:00Z",
    "architectures": ["x86_64"]
  }
}
```

`latestRelease` is `null` when no release is recorded. Fetch `url` for complete data.

## Categories and architectures

Collection entries contain an ID, application count, and canonical detail URL. Categories also
include their display name and website slug:

```json
{
  "id": "AudioVideo",
  "name": "Audio Video",
  "slug": "audio-video",
  "count": 4,
  "url": "/api/v1/categories/AudioVideo.json",
  "webUrl": "/categories/audio-video/"
}
```

Detail resources contain the same fields plus an `apps` array of summaries. Architecture membership
means the latest release has an artifact for that architecture. Architectures have no `webUrl`
because AppHub does not have architecture pages.

## Discovery lists

`/api/v1/new.json` returns the active addition window and matching summaries, newest first:

```json
{ "windowDays": 30, "apps": [] }
```

`/api/v1/updated.json` returns non-deprecated applications with releases ordered by latest release:

```json
{ "apps": [] }
```

## Rankings

Ranking endpoints return their period and either ordered entries or `null`:

```json
{
  "period": "week",
  "entries": []
}
```

Each entry contains `app`, with the complete application summary shape shown above, and its numeric
`downloads` count.

`entries: null` means there is not enough history to calculate the period. An empty array means
history exists but no applications have a count. Entries are ordered by downloads descending and
then application name.

## Static behavior

- Unknown application, category, architecture, and ranking paths return static 404 responses.
- Collection endpoints return complete results without pagination.
- Consumers can search and filter the application collection locally.
- Asset and canonical URLs can contain the deployment base path and should be read from responses.
