# Catalog

Each application has one reviewed manifest:

```text
apps/example-app.json
```

Copy the [application template](app.template.json) to `apps/<slug>.json`. Use a lowercase slug with
words separated by hyphens. An app submission should change only this file.

## Fill in the template

The template uses Flathub and GitHub by default. Change these fields:

1. Set `appstream.id` to the application's AppStream ID from Flathub. If the application is not on
   Flathub, use one of the alternative AppStream sources described below.
2. Set `addedAt` to the date the listing is added to AppHub, formatted as `YYYY-MM-DD`.
3. Set `origin.type` to `third-party` unless the upstream project publishes or endorses the exact
   AppImage source. Upstream entries need an evidence URL.
4. Set `releaseSource.repository` to the repository that publishes the AppImage, formatted as
   `owner/repository`. Change the release source when it uses GitLab, Codeberg, or a release feed.
5. Describe the minimum host access the application needs under `sandbox`.

The template denies all host access and isolates the app's processes. Grant only what the app needs.

Do not add optional fields unless they apply:

- `assets` overrides automatic AppImage architecture detection when filenames are ambiguous.

The generator gets names, descriptions, links, media, releases, and checksums from the configured
sources. Do not add generated data to the pull request.

CI writes generated app data and media under `.generated/`. Production commits this data so builds
do not need application sources. Contributor pull requests must not change it.

## Stored data

- `apps/*.json` contains reviewed source settings.
- `.generated/` contains the committed last-known-good catalog, media, history, and statistics.
- `dist/`, `.astro/`, and installed dependencies are disposable.

`.generated/snapshot.json` identifies the complete catalog snapshot. Its revision changes only when
catalog data changes. If `.generated/` is lost, restore it from Git. Regenerating from current
sources cannot recreate data that has disappeared upstream.

## Manifest

Each manifest contains source pointers and information AppHub cannot determine safely:

- The AppStream and AppImage release sources.
- The catalog addition date and reviewed AppImage origin.
- The required sandbox access.
- Optional AppImage filename overrides.

Unknown fields are rejected and URLs must use HTTPS.

## Generated information

The generator gets the following from AppStream:

- ID, name, summary, description, project license, developer, and project links.
- Categories, keywords, and MIME types.
- Content rating and warnings when the source provides them.
- Icon and screenshot sources and captions.

English is the default locale. Other locales store only text that differs from English. Localized
text falls back from the exact locale to its language and then to the default AppStream value.

Descriptions preserve AppStream paragraphs, ordered and unordered lists, emphasis, and code as
structured data. Unsupported description markup fails the build.

Images are downloaded, checked, converted to WebP, and stored under `.generated/media/` by their
SHA-256. The website serves these local files instead of loading images from upstream. AppHub keeps
icons at no more than 256 by 256 pixels and up to five screenshots fitted within 1280 by 800 pixels.

Catalog content is not covered by AppHub's source-code license, including when delivered through the
API. Individual materials remain subject to the rights and licenses of their respective sources.
Mirroring media for an application listing does not grant any additional rights to that media.

To request a correction or removal, open an issue naming the app, the image, the reason, and an
authoritative replacement when one exists.

The generator also finds the latest release and records the size and SHA-256 of each AppImage. The
files remain hosted by their release source.

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
conventions, including `developer/name` and `provides/mediatype` elements and `xml:lang` attributes.
Add explicit media only for package-local icons or missing screenshots:

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

Use `manual` only when upstream publishes no AppStream metadata:

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

Optional fields are `repository`, `links`, `contentRating`, `keywords`, `mimeTypes`, and
`translations`.

Direct MetaInfo sources must describe one `desktop-application`, match the configured application
ID, and use a redistributable AppStream metadata license. Collection catalogs and compressed indexes
are not application submission sources.

## Release sources

Supported sources are `github`, `gitlab`, `codeberg`, and `feed`. The build uses the newest stable
release.

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

Remote sources must use HTTPS and public addresses. Redirects and downloads are checked and limited.
A release can have at most ten files. Each file is limited to 2 GiB and a release to 4 GiB.

## Sandbox policy

The sandbox policy lists the host access an app needs. AppHub publishes it, while installers and
runtimes enforce it. Start with the denied defaults in the template and grant only required access.
See [Sandbox v1](sandbox.md) for every field and the runtime rules.

## Origin and listing state

`origin.type` describes where the AppImage comes from, not whether it is safe:

- `upstream` means the upstream project publishes the exact AppImage source in its own repository,
  or links to it from a project-controlled page. The manifest records the reviewed evidence URL.
- `third-party` means someone else builds or publishes the AppImage.

The AppStream ID identifies the app. The manifest filename is its current website slug. Before
AppHub 1.0, renamed or removed slugs do not leave redirects.

See [Origin and provenance](provenance.md) for what AppHub records and
[Refresh failures and freshness](freshness.md) for failure behavior.
