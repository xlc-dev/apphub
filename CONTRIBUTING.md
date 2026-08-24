# Contributing

AppHub accepts code changes, documentation improvements, bug reports, and application listings.
Submit changes through a pull request and keep each pull request focused on one change.

## Before contributing

Read the documentation relevant to your change:

- [Catalog documentation](docs/catalog.md) for application listings, assets, sandbox policies, and
  releases.
- [API documentation](docs/api.md) for public endpoint behavior and response structures.
- [Workflow documentation](docs/workflows.md) for validation, catalog maintenance, and deployment.

An application listing consists only of `apps/<slug>/app.json`. Do not submit downloaded metadata,
images, release files, or changes under `.generated/`; CI generates them from the reviewed sources
in that manifest. Start with the [application template](docs/app.template.json); every field is
explained in the [catalog documentation](docs/catalog.md).

## Development

Bun is the first-class development environment and the only one fully supported by the project:

```sh
bun install
```

Node.js 22.18 or newer with npm is expected to work, but may have compatibility issues:

```sh
npm install
npm run validate:node
```

The same applies to pnpm:

```sh
pnpm install
pnpm run validate:node
```

The small `pnpm-workspace.yaml` only allows esbuild's required install script. It does not make this
a multi-package workspace.

The main directories are:

- `src/` contains the website and public API.
- `apps/` contains one manifest per application.
- `catalog/` contains catalog schemas.
- `.generated/` contains the CI-owned catalog, media, releases, and statistics.
- `scripts/` contains release, statistics, and validation tooling.
- `tests/` contains the test suite.

Prefer small changes that reuse existing code and dependencies. Add or update tests when behavior
changes.

Run the complete validation before submitting a pull request:

```sh
bun run validate
```

For focused work, use `bun test`, `bun run check`, or `bun run format:check`. Node users can run
`npm run test:node` or `pnpm run test:node`; the other script names are unchanged.

## Pull requests

Explain what changed and why. A pull request adding an application must add only its `app.json`.
Generated catalog files are committed by the production workflow. Contributor changes to
`.generated/` are rejected.

Continuous integration runs the complete validation for every pull request. Pull requests from
branches in this repository also receive a static preview deployment.
