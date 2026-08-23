<p align="center">
  <img src="public/logo.svg" alt="AppHub logo" width="100">
</p>

<h1 align="center">AppHub</h1>

<p align="center">
  The Universal AppImage Store.
</p>

<p align="center">
  Discover and download AppImages directly from their publishers.
</p>

---

AppHub is a static catalog and storefront for AppImages. It brings application metadata, releases,
checksums, screenshots, download trends, and sandbox requirements together without repackaging
upstream artifacts.

## Features

- Browse, search, and filter applications by category.
- Find new, recently updated, and trending applications.
- Download original AppImages directly from their publishers.
- Install apps in one click through the `appmgr://` protocol, used directly by
  [AppManager](https://github.com/kem-a/AppManager).
- Inspect architectures, file sizes, SHA-256 checksums, and sandbox requirements.
- Consume the same catalog through a versioned JSON API.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Catalog](docs/catalog.md)
- [API](docs/api.md)
- [Workflows](docs/workflows.md)

## License

AppHub source code is licensed under the
[GNU Affero General Public License, version 3 or later](LICENSE). Catalog metadata and generated API
data are available under [CC0 1.0](LICENSE-CC0). Generated icons and screenshots retain the licenses
recorded in each application manifest.

The AppHub name and logo are not licensed for use as the identity of another project or service.
Application names and trademarks remain the property of their respective owners.
