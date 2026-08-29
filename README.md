<p align="center">
  <img src="public/logo.svg" alt="AppHub logo" width="100">
</p>

<h1 align="center">AppHub</h1>

<p align="center">
  The Universal AppImage Store.
</p>

<p align="center">
  Discover AppImages and download them directly from their release sources.
</p>

---

AppHub is a static storefront for AppImages. It brings releases, permissions, source details, and
download information together without rehosting the apps.

## Features

- Browse and filter AppImages by category, architecture, license, interface, and host access.
- Discover new apps, recent releases, and download trends.
- Check the publisher, required permissions, file size, and SHA-256 before installing.
- Download the right architecture directly from its release source.
- Install directly through [AppManager](https://github.com/kem-a/AppManager) using the `appimg://`
  protocol.
- Build another installer or storefront with the versioned JSON API.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Catalog](docs/catalog.md)
- [API](docs/api.md)
- [Sandbox v1](docs/sandbox.md)
- [Origin and provenance](docs/provenance.md)
- [Refresh failures and freshness](docs/freshness.md)
- [Security](docs/security.md)
- [Workflows](docs/workflows.md)

## License

AppHub's source code, including the API implementation and schemas, is licensed under the
[GNU Affero General Public License, version 3 or later](LICENSE). Catalog content is not covered by
that license, including when delivered through the API. Individual materials remain subject to the
rights and licenses of their respective sources.

The AppHub name and logo are not licensed for use as the identity of another project or service.
Application names and trademarks remain the property of their respective owners.
