# Catalog

Each application has one reviewed manifest:

```text
apps/example-app.json
```

Copy the [application template](app.template.json) to `apps/<slug>.json`, using a lowercase,
hyphen-separated slug. A contributor pull request must add only that file. The `apps/` directory may
contain only manifests named this way.

## Fill in the template

The template contains the common Flathub and GitHub setup. Change these required fields:

1. Set `appstream.id` to the application's AppStream ID from Flathub. If the application is not on
   Flathub, use one of the alternative AppStream sources described below.
2. Set `addedAt` to the date the listing is added to AppHub, formatted as `YYYY-MM-DD`.
3. Set `origin.type` to `third-party` unless the upstream project publishes or explicitly endorses
   the exact AppImage source. Upstream entries also require reviewed evidence, as described below.
4. Set `releaseSource.repository` to the repository that publishes the AppImage, formatted as
   `owner/repository`. Change the release source when it uses GitLab, Codeberg, or a release feed.
5. Describe the minimum host access the application needs under `sandbox`.

The template sandbox denies network, display, audio, IPC, filesystem, device, portal, and D-Bus
access. It also isolates the application's processes. Keep those values and empty arrays unless the
application needs additional access. Grant only the specific access it requires, using the sandbox
reference below.

Do not add optional fields unless they apply:

- `assets` overrides automatic AppImage architecture detection when filenames are ambiguous.

The generator obtains names, descriptions, categories, links, icons, screenshots, releases,
checksums, and other derived data automatically. It also records where each generated part was
observed. Do not add those fields or generated files to the pull request.

CI reads the manifest, fetches upstream data, and writes per-app records under `.generated/apps/`
and shared images under `.generated/media/`. The generated catalog is committed by the production
workflow so ordinary builds are fast, deterministic, and do not need network access. Contributor
pull requests must not change it.

## Stored state and recovery

AppHub keeps four kinds of state:

- `apps/*.json` is the reviewed source configuration.
- `.generated/` is the committed last-known-good catalog record. Application metadata, provenance,
  release observations, normalized media, download history, and statistics are durable because an
  upstream source may later change or disappear.
- HTTP validators such as `.generated/star-etags.json` and `validator` fields are refresh hints.
  They are committed so scheduled jobs can avoid unnecessary requests, but deleting them loses no
  catalog information.
- `dist/`, `.astro/`, and installed dependencies are disposable build output and caches.

`.generated/snapshot.json` identifies the complete catalog record. Its revision is derived from the
normalized manifests and durable generated data, excluding HTTP validators and deployment paths. Its
generation time changes only when that revision changes. Building the same snapshot therefore does
not rewrite API resources merely because the build ran later or used a different base path.

To recover a deployment, check out the required Git revision and run:

bun install --frozen-lockfile

bun run validate:catalog

BASE_PATH=/apphub bun run build

No upstream access is required. If `.generated/` is lost locally, restore it from Git rather than
regenerating it: current upstream data cannot recreate disappeared artifacts or historical
observations exactly. Clean-checkout CI performs this validation and builds the production
deployment.

## Manifest

Each application manifest contains only source pointers and information AppHub cannot determine
safely:

- The AppStream and AppImage release sources.
- The catalog addition date and reviewed AppImage origin.
- The required sandbox access.
- Optional AppImage filename overrides.

Unknown fields are rejected. URLs must use HTTPS and project licenses must be SPDX expressions.

## Generated information

For a Flathub source, the generator obtains the following from its AppStream record:

- ID, name, summary, description, project license, developer, and project links.
- Categories, keywords, and MIME types.
- Content rating and warnings when the source provides them.
- Icon and screenshot sources and captions.

English is the default metadata locale. The generator also requests every supported non-default
locale from Flathub and stores only fields that differ from English. Direct MetaInfo sources retain
localized names, summaries, descriptions, developer names, keywords, content-rating text, and
screenshot captions from `xml:lang` attributes. A localized field falls back from the exact locale
to its language and then to the default AppStream value.

Descriptions preserve AppStream paragraphs, ordered and unordered lists, emphasis, and code as
structured data. Unsupported description markup fails the build.

The generator downloads and validates all images rather than trusting their extensions. Icons are
stored as lossless WebP at no more than 256 by 256 pixels. Screenshots are stored as WebP fitted
within 1280 by 800 pixels, and AppHub keeps at most the first five screenshots. Upstream originals
are not retained.

Normalized images live under `.generated/media/`, named by their SHA-256. Identical media is
therefore stored and deployed once, while immutable names remain safe to cache. Each app may
reference at most 1 MiB of normalized media. The website always serves these committed local files;
upstream media URLs are retained only as provenance and are never used as browser image sources.

CC0 covers AppHub's normalized catalog and API data, not third-party icons, screenshots, application
names, or trademarks. Mirroring media for an application listing does not grant any additional
rights to that media.

To request correction or removal of mirrored media, open a repository issue identifying the
application and affected image, the reason for the request, and an authoritative replacement when
one exists. AppHub will stop publishing confirmed infringing or withdrawn media and determine
whether repository history also needs removal. Removing an image does not remove the application
unless the listing can no longer meet the catalog requirements.

The generator also fetches the latest release, selects its AppImage artifacts, and records their
sizes and an independently observed SHA-256 for each downloaded file. The AppImage itself remains
hosted by its configured release source. CI commits the normalized catalog and media after merge, so
a clean checkout can build without contacting upstream services.

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

An application that is not on Flathub may point to its standalone upstream MetaInfo XML. AppHub uses
remote HTTPS icons and screenshots from the XML when available. The document must use AppStream 1.0
elements, including `developer/name`, `provides/mediatype`, and `xml:lang`. Add explicit media only
for package-local icons or missing screenshots:

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
`media` objects live inside the manifest, keeping the application review surface to one file:

```json
{
  "type": "manual",
  "metadata": {
    "id": "org.example.App",
    "name": "Example",
    "summary": "Do something useful",
    "description": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "value": "A longer application description." }]
      }
    ],
    "projectLicense": "GPL-3.0-or-later",
    "developer": { "name": "Example developers" },
    "homepage": "https://example.org",
    "categories": ["Utility"]
  },
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

Optional metadata fields are `repository`, `links`, `contentRating`, `keywords`, `mimeTypes`, and
`translations`.

Direct MetaInfo sources must describe one `desktop-application`, match the configured application
ID, and use a redistributable AppStream metadata license. Collection catalogs and compressed indexes
are not application submission sources.

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

A release feed exposes a `releases` array:

```json
{
  "releases": [
    {
      "version": "1.2.3",
      "publishedAt": "2026-08-27T12:00:00Z",
      "page": "https://example.org/releases/1.2.3",
      "artifacts": [
        {
          "architecture": "x86_64",
          "name": "Example-1.2.3-x86_64.AppImage",
          "url": "https://example.org/releases/Example-1.2.3-x86_64.AppImage",
          "size": 12345678,
          "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
        }
      ]
    }
  ]
}
```

`version`, `publishedAt`, `page`, and at least one artifact are required. Each artifact requires an
`architecture`, filename, HTTPS URL, and byte size. `sha256` and `signatures` are optional. AppHub
calculates its own SHA-256 when it first observes an artifact, and a published SHA-256 must match.
Signatures are retained as upstream evidence but are not verified by AppHub.

Remote sources must use HTTPS, resolve exclusively to public addresses, and stay within response and
timeout limits. Redirect destinations are checked as new requests. AppStream XML document
declarations and custom entities are rejected. A release can contain at most ten artifacts. Each
downloaded artifact is limited to 2 GiB and their combined release size is limited to 4 GiB.

## Sandbox policy

The sandbox is an allowlist. Private application storage is implicit and unspecified host access is
denied. Every field is required so omission cannot accidentally broaden access.

- `network`: `none`, `client`, or `client-and-server`.
- `display`: `none`, `wayland`, `x11`, or `wayland-and-x11`.
- `audio`: `none`, `playback`, `capture`, or `playback-and-capture`.
- `processes`: `isolated`, `read`, or `control`.
- `ipc`: access to the host IPC namespace.
- `filesystem`: `home`, `desktop`, `documents`, `downloads`, `music`, `pictures`, `public-share`,
  `templates`, `videos`, or `removable-media`, with `read-only` or `read-write` access.
- `devices`: direct access to `gpu`, `input`, `camera`, `usb`, `serial`, `optical`, `fuse`, or
  `kvm`.
- `portals`: `background`, `camera`, `email`, `file-chooser`, `inhibit`, `location`,
  `notifications`, `open-uri`, `printing`, `screenshot`, `screencast`, `secrets`, or `settings`.
- `sessionBus` and `systemBus`: exact D-Bus names with `see`, `talk`, or `own` access.

Prefer portals and specific filesystem locations over broad host access.

## Origin and listing state

`origin.type` describes where the AppImage comes from, not whether it is safe:

- `upstream` means the upstream project publishes the exact AppImage source in its own repository,
  or links to it from a project-controlled page. The manifest records the reviewed evidence URL.
- `third-party` means someone else builds or publishes the AppImage.

The pull request and Git history identify who submitted the catalog entry. That is deliberately
separate from the application developer, the AppImage publisher, and the providers supplying
metadata or media.

Generated provenance records provider project, owner, release, and asset IDs where available,
alongside the current source URLs and refresh state. Repository renames are accepted when durable
IDs and ownership remain stable. Transfers, identity changes, feed URL changes, and changed release
assets quarantine scheduled updates and require a reviewed manifest change. Ordinary
scheduled-refresh failures retain the affected resource without blocking unrelated apps.

The AppStream `id` identifies the application, and the manifest filename supplies its current
website slug. Before AppHub 1.0, rename or remove entries directly and regenerate the catalog.
Historical slugs, redirects, discontinued listings, and compatibility records are not retained.

Temporary upstream failures, a repeatedly missing upstream, and quarantined changes remain
operational status rather than new application identities. See
[Origin and provenance](provenance.md) for the exact guarantees and limits, and
[Refresh failures and freshness](freshness.md) for failure behavior.
