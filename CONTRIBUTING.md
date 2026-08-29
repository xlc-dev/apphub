# Contributing

AppHub accepts code, documentation, bug reports, and app listings. Keep each pull request focused on
one change.

## Before contributing

Read the relevant guide before making a change:

- [Catalog documentation](docs/catalog.md) for application listings, assets, sandbox policies, and
  releases.
- [API documentation](docs/api.md) for public endpoint behavior and response structures.
- [Workflow documentation](docs/workflows.md) for validation, catalog maintenance, and deployment.

An app listing is one `apps/<slug>.json` file. Do not submit downloaded metadata, images, releases,
or anything under `.generated/`. CI creates that data from the manifest. Start with the
[application template](docs/app.template.json), then read the [catalog guide](docs/catalog.md). When
the manifest is ready, open an
[application submission pull request](https://github.com/xlc-dev/apphub/compare/main...HEAD?quick_pull=1&template=app-submission.md)
to use the application checklist.

## Development

AppHub supports Bun and Node.js 22.22.3 or newer. Bun is the main development environment:

```sh
bun install
```

With npm:

```sh
npm install
npm run validate:node
```

With pnpm:

```sh
pnpm install
pnpm run validate:node
```

The repository is split by purpose:

- `apps/` contains the reviewed application manifests. Each app has one `apps/<slug>.json` file.
- `src/pages/` defines website routes and API endpoints.
- `src/components/` contains reusable interface components.
- `src/views/` contains pages shared by multiple routes or languages.
- `src/lib/` contains shared website logic, translations, and catalog queries.
- `src/client/` contains JavaScript that runs in the browser.
- `catalog/` validates manifests and fetches application metadata, releases, and media.
- `scripts/` contains catalog maintenance and validation commands.
- `public/` contains static files copied into the built website.
- `tests/` contains the test suite.
- `docs/` contains project documentation.
- `.generated/` contains CI-generated catalog data. Do not edit or commit it.

Prefer small changes that reuse existing code and dependencies. Add or update tests when behavior
changes.

Run the complete validation before submitting a pull request:

```sh
bun run validate
```

For focused work, use `bun test`, `bun run check`, or `bun run format:check`. Node users can use
`npm run test:node` or `pnpm run test:node`.

## Pull requests

Explain what changed and why. App listing pull requests must contain only the manifest. Contributor
changes under `.generated/` are rejected.

Continuous integration runs the complete validation for every pull request. Pull requests from
branches in this repository also receive a static preview deployment.
