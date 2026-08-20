<p align="center">
  <img src="public/logo.svg" alt="AppHub logo" width="100">
</p>

<h1 align="center">AppHub</h1>

<p align="center">
  The Universal AppImage Store.
</p>

---

AppHub is an open source store for discovering and downloading AppImages. It
keeps releases, checksums, screenshots, capabilities, and download information
together in a catalog for people and other applications.

## Features

- **App discovery:** Browse apps, categories, new additions, updates, and
  download trends.

- **Direct downloads:** Download original AppImages from their publishers without repackaging.

- **Checksummed artifacts:** Every artifact includes its architecture, file size,
  and SHA-256 checksum.

- **Clear capabilities:** Listings describe the files, devices, services, and
  network access an app is expected to use.

- **Public API:** Other software can consume the generated catalog through `/api/v1`.

- **Self-contained listings:** AppHub serves icons and screenshots itself.

## API

The site and public API use the same Zod-typed catalog service. The static build
generates endpoints for apps, categories, new apps, and download rankings:

- `/api/v1/apps` and `/api/v1/apps/{slug}`
- `/api/v1/categories` and `/api/v1/categories/{slug}`
- `/api/v1/new`
- `/api/v1/trending/week`, `/api/v1/trending/month`, and
  `/api/v1/trending/all-time`

App manifests use `source: "official"` for listings maintained by the original
developers and `source: "community"` for third-party listings. Contributors
provide the icon and screenshots; AppHub does not fetch remote images. Images
are decoded and validated when the catalog is loaded.

Application metadata follows useful AppStream conventions: reverse-DNS IDs,
SPDX project license expressions, developer attribution, registered Freedesktop
categories, search keywords, and optional MIME types or URI handlers.

AppHub adds provenance, catalog addition dates, expected access, artifact
checksums, and release-source configuration. Internal release-source details are
not exposed by the public API.

Release metadata can come from GitHub Releases, an HTTPS JSON feed, or a
maintained `releases.json`. AppHub uses published checksums when available. It
downloads a new artifact once when it must calculate the checksum itself.

Release synchronization compares upstream metadata with recorded releases and
fails without changing the catalog when a source cannot be processed. Stored
artifacts are not downloaded again.

## Submitting apps

See [CONTRIBUTING.md](CONTRIBUTING.md) for the catalog format, release sources,
asset requirements, and validation steps.

By submitting an app listing, you confirm that you have permission to provide
its metadata, icon, and screenshots. You dedicate your copyright and database
rights in that submitted catalog content to the public domain under CC0 1.0 so
AppHub and applications using its API may freely display and redistribute it.

CC0 does not transfer ownership of application names or trademarks.

## License

AppHub source code is licensed under the GNU Affero General Public License,
version 3 or later. Submitted metadata, icons, screenshots, and generated API
data are available under CC0 1.0.

The AppHub name and logo are not licensed for use as the identity of another
project or service. Application names and trademarks remain the property of
their respective owners.
