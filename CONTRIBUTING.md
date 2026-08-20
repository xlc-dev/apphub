# Contributing

AppHub accepts code changes, documentation improvements, bug reports, and
application listings. Submit changes through a pull request and keep each pull
request focused on one change.

## Code contributions

Install dependencies before working on the site or catalog tooling:

```sh
bun install --frozen-lockfile
```

The main directories are:

- `src/` for pages, components, layouts, and site logic.
- `catalog/` for catalog schemas and shared catalog behavior.
- `scripts/` for release and download maintenance.
- `tests/` for Bun tests.

Prefer small changes that reuse existing code and dependencies. Add or update
tests when behavior changes. Run the complete validation before submitting a
pull request:

```sh
bun run validate
```

For focused work, `bun test`, `bun run check`, and `bun run format:check` can be
run separately.

## Application listings

Create one directory under `apps/` using a lowercase, hyphen-separated slug:

```text
apps/example-app/
├── app.json
├── icon.webp
├── releases.json
└── screenshot-1.webp
```

The icon and screenshots are served by AppHub. Do not use remote image URLs.
Supported formats are PNG, JPEG, WebP, and AVIF. Icons must be square, static,
and between 128 and 1024 pixels. Screenshots must be static, use names such as
`screenshot-1.webp`, and match the files declared in `app.json`.

### Manifest

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
  "screenshots": [
    {
      "file": "screenshot-1.webp",
      "caption": "Main window"
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

- `id` should be the application's reverse-DNS AppStream ID.
- `projectLicense` must be a valid SPDX expression.
- `addedAt` is the date the listing was added to AppHub, written as
  `YYYY-MM-DD`. It is not the application's release date.
- `categories` must use registered Freedesktop categories and include at least
  one main category. The accepted registry is in `catalog/categories.ts`.
- `source` is `official` when the listing is maintained by the application's
  developers and `community` otherwise.
- `sandbox` is the minimum host access an application manager must grant. It is
  an allowlist: access not declared there must be denied.
- `keywords`, `mimeTypes`, `repository`, and `developer.url` are optional.
- Use `deprecated: true` for a discontinued listing. `replacedBy` may identify
  another application ID already present in the catalog.
- Keep `keywords`, `categories`, `mimeTypes`, and `screenshots` free of
  duplicates. Screenshots appear in manifest order.

### Sandbox policy

The sandbox policy describes required behavior, independently of a particular
sandbox implementation. An application manager may translate it to Bubblewrap,
Landlock, namespaces, portals, or another mechanism. All fields are required so
an omitted field cannot accidentally broaden access. Private storage belonging
to the application is implicit and does not need a filesystem entry.

- `network`: `none`, outbound `client`, or `client-and-server` when the app must
  also accept incoming connections.
- `display`: `none`, `wayland`, `x11`, or `wayland-and-x11`.
- `audio`: `none`, `playback`, `capture`, or `playback-and-capture`.
- `processes`: `isolated`, read-only host process visibility with `read`, or
  host process signalling and control with `control`.
- `ipc`: whether the app must share the host IPC namespace. Keep this `false`
  unless the application cannot work without it.
- `filesystem`: named user locations with `read-only` or `read-write` access.
  Locations are `home`, `desktop`, `documents`, `downloads`, `music`,
  `pictures`, `public-share`, `templates`, `videos`, and `removable-media`.
  Prefer a specific location over the entire home directory.
- `devices`: direct access to `gpu`, `input`, `camera`, `usb`, `serial`,
  `optical`, `fuse`, or `kvm`. Prefer a portal where one exists.
- `portals`: access through `background`, `camera`, `email`, `file-chooser`,
  `inhibit`, `location`, `notifications`, `open-uri`, `printing`, `screenshot`,
  `screencast`, `secrets`, or `settings`.
- `sessionBus` and `systemBus`: exact D-Bus service names with `see`, `talk`, or
  `own` access. Wildcards are not accepted. Portal services belong in
  `portals`, not these lists.

Use empty arrays and `none`, `isolated`, or `false` when access is unnecessary.
Do not add permissions merely because they might be useful.

If automatic architecture detection is ambiguous, add filename patterns keyed
by architecture:

```json
"assets": {
  "x86_64": "Example-*-x86_64.AppImage",
  "aarch64": "Example-*-aarch64.AppImage"
}
```

Patterns match filenames only and must end in `.AppImage`.

### Releases

Choose one release source:

- `github` reads stable GitHub Releases from an `owner/repository`.
- `feed` reads an HTTPS AppHub release feed.
- `direct` uses a manually maintained `releases.json`.

For GitHub and feed sources, generate or update the release lock with:

```sh
bun run update-releases example-app
```

Commit the resulting `releases.json` with the application listing. Automated
updates append new releases later without rewriting recorded history.

The updater uses a published SHA-256 checksum when one is available. Otherwise,
it downloads a newly discovered artifact once to calculate the checksum. Stored
artifacts are not downloaded again.

A feed has this shape:

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

Release data follows these rules:

- Order releases from newest to oldest by `publishedAt`.
- Write `publishedAt` as a UTC ISO 8601 timestamp ending in `Z`, such as
  `2026-08-20T12:00:00Z`.
- Keep release versions unique.
- Include each architecture at most once per release.
- Use HTTPS for release pages and artifact URLs.
- Record artifact sizes as bytes and SHA-256 checksums as 64 lowercase
  hexadecimal characters.
- A feed checksum is optional. A checksum in `releases.json` is required.

The stored `releases.json` wraps the releases with an `appId` matching the
manifest:

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

For a `direct` source, create and maintain this file manually. For GitHub and
feed sources, let the updater manage it. Do not rewrite, reorder, or remove
recorded releases; the updater rejects changes to published release metadata.

### Rights

Only submit metadata and images that you own or are authorized to provide under
CC0 1.0. By submitting catalog content, you dedicate your copyright and database
rights in that content under CC0 1.0. This does not transfer application
trademarks or rights owned by other people. See `LICENSE-CC0` for the full terms.

### Validation

After creating `app.json`, the images, and `releases.json`, run the complete
validation:

```sh
bun install --frozen-lockfile
bun run validate
```

`bun run validate` checks formatting, types, tests, the static build, catalog
files, images, and release locks.
