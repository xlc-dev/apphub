# Catalog

The AppHub catalog is the source of application metadata used by both the website and the public
API. Each application is stored as a self-contained directory under `apps/`. AppHub serves listing
images itself and links release artifacts directly to their upstream publishers.

## Directory structure

Use a lowercase, hyphen-separated directory name:

```text
apps/example-app/
├── app.json
├── icon.png
├── releases.json
└── screenshot-1.png
```

Only `app.json`, `releases.json`, one icon, and the screenshots referenced by the manifest are
allowed. Symbolic links and unreferenced assets are rejected.

## Application manifest

`app.json` contains maintained application metadata:

```json
{
  "id": "org.example.App",
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
  "releaseSource": {
    "type": "github",
    "repository": "example/app"
  },
  "icon": {
    "license": "CC0-1.0",
    "source": "https://example.org/icon.png"
  },
  "screenshots": [
    {
      "file": "screenshot-1.png",
      "caption": "Main window",
      "license": "CC0-1.0",
      "source": "https://example.org/screenshot.png"
    }
  ],
  "sandbox": {
    "network": "client",
    "display": "wayland",
    "audio": "playback",
    "processes": "isolated",
    "ipc": false,
    "filesystem": [
      {
        "location": "music",
        "access": "read-only"
      }
    ],
    "devices": ["gpu"],
    "portals": ["file-chooser", "notifications", "open-uri"],
    "sessionBus": [],
    "systemBus": []
  }
}
```

All objects reject unknown fields. URLs must use HTTPS.

### Identity and presentation

- `id` is the application's reverse-DNS AppStream ID.
- `name` is limited to 100 characters.
- `summary` is a short description limited to 200 characters.
- `description` is plain text and is limited to 10,000 characters.
- `projectLicense` is a valid SPDX license expression.
- `developer.name` identifies the developer; `developer.url` is optional.
- `homepage` is the canonical project homepage.
- `repository` is optional and is used for repository metadata when the host is supported.
- `addedAt` is the catalog addition date in `YYYY-MM-DD` form, not the release date.

### Discovery metadata

- `keywords` is an optional list of up to 50 unique search terms.
- `categories` contains unique registered Freedesktop categories and must contain at least one main
  category. The accepted registry is defined in `catalog/categories.ts`.
- `mimeTypes` is an optional list of up to 100 unique MIME types handled by the application.

### Provenance and lifecycle

- `source` is `official` when the listing is maintained by the application's developers and
  `community` otherwise.
- `deprecated: true` marks a discontinued listing.
- `replacedBy` may contain the application ID of its replacement. The replacement must already exist
  in the catalog.

## Images

Icons and screenshots are stored beside the manifest. PNG, JPEG, WebP, and AVIF are supported.
Images are decoded during validation rather than accepted by extension alone.

Icons must be static, square, and between 128 and 1024 pixels in each dimension. Name the icon
`icon` followed by its actual extension.

Screenshots must be static, use names such as `screenshot-1.png`, and have reasonable dimensions.
Every screenshot must be declared in `app.json`, and every declared screenshot must exist. Manifest
order determines display order. Between one and ten screenshots are allowed.

The icon and every screenshot record:

- `license`: a valid SPDX expression describing redistribution terms.
- `source`: the HTTPS location from which the image originated.
- `file`: the local filename, for screenshots only.
- `caption`: a short accessible description, for screenshots only.

Only include images that AppHub may redistribute under their recorded licenses. Prefer original
upstream sources and preserve required attribution.

## Sandbox policy

The sandbox policy describes the minimum host access required by an application independently of a
specific implementation. It is an allowlist: access not declared by the policy is denied. Private
application storage is implicit.

Every field is required so that omitted metadata cannot broaden access accidentally. Use empty
arrays and the restrictive `none`, `isolated`, or `false` values when access is unnecessary.

### General access

- `network`: `none`, outbound `client`, or `client-and-server` when incoming connections are also
  required.
- `display`: `none`, `wayland`, `x11`, or `wayland-and-x11`.
- `audio`: `none`, `playback`, `capture`, or `playback-and-capture`.
- `processes`: `isolated`, read-only host process visibility with `read`, or host process signalling
  and control with `control`.
- `ipc`: whether the application requires the host IPC namespace. Keep it `false` unless required.

### Filesystem access

Each filesystem rule has a `location` and `read-only` or `read-write` access. Locations are `home`,
`desktop`, `documents`, `downloads`, `music`, `pictures`, `public-share`, `templates`, `videos`, and
`removable-media`. Each location may appear once. Prefer a specific location over the entire home
directory.

### Devices and portals

Direct device values are `gpu`, `input`, `camera`, `usb`, `serial`, `optical`, `fuse`, and `kvm`.

Portal values are `background`, `camera`, `email`, `file-chooser`, `inhibit`, `location`,
`notifications`, `open-uri`, `printing`, `screenshot`, `screencast`, `secrets`, and `settings`.
Prefer a portal over direct access where one is available.

### D-Bus access

`sessionBus` and `systemBus` contain exact service names. Each entry grants `see`, `talk`, or `own`
access. Wildcards are not accepted, and a service may appear only once in each list. Portal services
belong in `portals` rather than these lists.

## Release sources

Every manifest selects one release source:

- `github` reads stable GitHub Releases from an `owner/repository`.
- `gitlab` reads GitLab.com Releases from a `namespace/repository`; nested groups are supported.
- `codeberg` reads Codeberg Releases from an `owner/repository`.
- `feed` reads an HTTPS AppHub release feed.
- `direct` uses a manually maintained `releases.json`.

GitHub, GitLab, and Codeberg use this structure with the corresponding type:

```json
{
  "type": "github",
  "repository": "example/app"
}
```

A feed source contains its URL:

```json
{
  "type": "feed",
  "url": "https://example.org/apphub-releases.json"
}
```

When automatic architecture detection from filenames is ambiguous, add filename patterns keyed by
architecture to the manifest:

```json
"assets": {
  "x86_64": "Example-*-x86_64.AppImage",
  "aarch64": "Example-*-aarch64.AppImage"
}
```

Patterns match filenames only, must end in `.AppImage`, and must select one unambiguous artifact per
architecture.

## Release feed

An AppHub feed exposes a `releases` array:

```json
{
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

Artifact `size` and `sha256` are optional in a feed. When the checksum is absent, AppHub downloads a
new artifact once to calculate it. A published size is checked against the downloaded artifact.

## Release lock

`releases.json` stores the normalized release history used by the site and API:

```json
{
  "appId": "org.example.App",
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

The lock follows these rules:

- `appId` matches the ID in `app.json`.
- Releases are ordered newest to oldest by `publishedAt`.
- `publishedAt` is a UTC ISO 8601 timestamp.
- Versions are unique.
- Each architecture appears at most once per release.
- Release pages and artifact URLs use HTTPS.
- Artifact size is recorded in bytes.
- SHA-256 is recorded as 64 lowercase hexadecimal characters.

For a direct source, maintain the lock manually. For other sources, generate it with:

```sh
bun run update-releases example-app
```

The updater selects the current release history, normalizes upstream metadata, and preserves
recorded releases. It fails without changing the lock when a source cannot be processed or recorded
history conflicts with upstream data. Do not rewrite, reorder, or remove published release entries.

## Validation

Run complete project and catalog validation with:

```sh
bun run validate
```

This checks formatting, Astro and TypeScript diagnostics, tests, the static build, directory
contents, manifests, release locks, stored statistics, and decoded image properties.
