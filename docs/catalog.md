# Catalog

Each application has one reviewed source file:

```text
apps/example-app/app.json
```

Copy the [application template](app.template.json) to `apps/<slug>/app.json`, using a lowercase,
hyphen-separated slug, and fill it in. A contributor pull request must add only that file. Any other
file in the application directory is rejected.

CI reads `app.json`, fetches upstream data, and writes the result under `.generated/apps/`. The
generated catalog is committed by the production workflow so ordinary builds are fast,
deterministic, and do not need network access. Contributor pull requests must not change it.

## Manifest

```json
{
  "appstream": {
    "type": "flathub",
    "id": "org.example.App"
  },
  "addedAt": "2026-08-23",
  "source": "community",
  "mediaLicense": {
    "icon": "GPL-3.0-or-later",
    "screenshots": "GPL-3.0-or-later"
  },
  "releaseSource": {
    "type": "github",
    "repository": "example/app-appimage"
  },
  "sandbox": {
    "network": "none",
    "display": "wayland-and-x11",
    "audio": "none",
    "processes": "isolated",
    "ipc": false,
    "filesystem": [],
    "devices": ["gpu"],
    "portals": [],
    "sessionBus": [],
    "systemBus": []
  }
}
```

`app.json` contains only source pointers and information AppHub cannot determine safely:

- The AppStream and AppImage release sources.
- The catalog addition date and whether the package is official or community maintained.
- Icon and screenshot redistribution licenses.
- The required sandbox access.
- Optional lifecycle and AppImage filename overrides.

Unknown fields are rejected. URLs must use HTTPS and licenses must be SPDX expressions.

## Generated information

For a Flathub source, the generator obtains the following from its AppStream record:

- ID, name, summary, description, project license, developer, and links.
- Categories, keywords, and MIME types.
- Icon and screenshot sources and captions.

Descriptions preserve AppStream paragraphs, ordered and unordered lists, emphasis, and code as
structured data. Unsupported description markup fails the build.

The generator downloads and validates all images rather than trusting their extensions. It also
fetches the latest release, selects its AppImage artifacts, and records their sizes and SHA-256
hashes in the generated catalog. CI commits this output after merge.

Run the same generation step without building the site with:

bun run generate-catalog

Pass one or more application slugs to refresh only those entries:

bun run generate-catalog -- example-app

## AppStream sources

The normal source is Flathub:

```json
{
  "type": "flathub",
  "id": "org.example.App"
}
```

An application that is not on Flathub may point to its upstream MetaInfo XML. Because generic
AppStream XML does not guarantee remotely downloadable media, include those source URLs explicitly:

```json
{
  "type": "url",
  "id": "org.example.App",
  "url": "https://example.org/org.example.App.metainfo.xml",
  "media": {
    "icon": "https://example.org/icon.png",
    "screenshots": [
      {
        "caption": "Main window",
        "source": "https://example.org/screenshot.png"
      }
    ]
  }
}
```

`manual` is the last resort when upstream publishes no AppStream metadata. Its `metadata` and
`media` objects live inside `app.json`, keeping the application review surface to one file.

## Release sources

Supported sources are `github`, `gitlab`, `codeberg`, and `feed`. Forge sources contain a repository
name; feeds contain an HTTPS URL. The build uses the newest stable release.

Automatic architecture detection uses AppImage filenames. Add `assets` only when those names are
ambiguous:

```json
{
  "assets": {
    "x86_64": "Example-*-x86_64.AppImage",
    "aarch64": "Example-*-aarch64.AppImage"
  }
}
```

Patterns match filenames only and must end in `.AppImage`.

A release feed exposes a `releases` array. Artifact sizes and SHA-256 values are optional; AppHub
downloads an artifact to calculate missing values.

## Sandbox policy

The sandbox is an allowlist. Private application storage is implicit and unspecified host access is
denied. Every field is required so omission cannot accidentally broaden access.

- `network`: `none`, `client`, or `client-and-server`.
- `display`: `none`, `wayland`, `x11`, or `wayland-and-x11`.
- `audio`: `none`, `playback`, `capture`, or `playback-and-capture`.
- `processes`: `isolated`, `read`, or `control`.
- `ipc`: access to the host IPC namespace.
- `filesystem`: named locations with `read-only` or `read-write` access.
- `devices`: direct access to `gpu`, `input`, `camera`, `usb`, `serial`, `optical`, `fuse`, or
  `kvm`.
- `portals`: required desktop portals.
- `sessionBus` and `systemBus`: exact D-Bus names with `see`, `talk`, or `own` access.

Prefer portals and specific filesystem locations over broad host access.

## Lifecycle

`source` is `official` only when the AppImage listing is maintained by the application developer.
Otherwise use `community`. Set `deprecated` to `true` for a discontinued listing. `replacedBy` may
contain the AppStream ID of another application already in the catalog.
