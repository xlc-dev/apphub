<p align="center">
  <img src="public/logo.svg" alt="AppHub logo" width="100">
</p>

<h1 align="center">AppHub</h1>

<p align="center">
  The Universal AppImage Store.
</p>

---

AppHub is an open source store for discovering and downloading AppImages. It keeps releases, checksums, screenshots, capabilities, and download information together in a catalog that is useful to people and other applications.

## Features

- **App discovery:** Browse all apps, categories, new additions, recent updates, and download trends.

- **Direct downloads:** Download original AppImages from their publishers without repackaging.

- **Verified artifacts:** Every listed artifact includes its architecture, file size, and SHA-256 checksum.

- **Clear capabilities:** Listings describe the files, devices, services, and network access an app is expected to use.

- **Public API:** Other software can consume the generated catalog through `/api/v1`.

- **Self-contained listings:** Icons and screenshots are served by AppHub instead of depending on third-party image hosts.

## API

The site and public API use the same Zod-typed catalog service. The static build generates endpoints for apps, categories, new apps, and download rankings:

- `/api/v1/apps` and `/api/v1/apps/{slug}`
- `/api/v1/categories` and `/api/v1/categories/{slug}`
- `/api/v1/new`
- `/api/v1/trending/week`, `/api/v1/trending/month`, and `/api/v1/trending/all-time`

App manifests use `source: "official"` for listings maintained by the original developers and `source: "community"` for third-party listings. Contributors provide the icon and screenshots with each app submission; AppHub does not fetch remote images. Images may be PNG, JPEG, WebP, or AVIF files and are fully decoded and validated during catalog loading. Their generated URLs and media types are included in the API for other stores to consume.

Release metadata can come from GitHub Releases, an HTTPS JSON feed, or a directly maintained `releases.json`. A feed contains a newest-first `releases` array using the same release and artifact fields as `releases.json`; artifact `sha256` values are optional. AppHub uses a source-provided checksum when available and downloads a new artifact once only when it must calculate the checksum itself.

Automated checks record each application's health separately from its release history. One or two consecutive failures mark an application as degraded; three mark it unavailable. A later successful check restores it to healthy without discarding its last known valid releases.

## Submitting apps

By submitting an app listing, you confirm that you have permission to provide its metadata, icon, and screenshots. You dedicate your copyright and database rights in that submitted catalog content to the public domain under CC0 1.0 so AppHub and applications using its API may freely display and redistribute it.

CC0 does not transfer ownership of application names or trademarks.

## License

AppHub source code is licensed under the GNU Affero General Public License, version 3 or later. Submitted app metadata, icons, screenshots, and the generated API data are available under CC0 1.0 so other applications may freely use the catalog.

The AppHub name and logo are not licensed for use as the identity of another project or service. Application names and trademarks remain the property of their respective owners.
