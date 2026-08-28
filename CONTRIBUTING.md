# Contributing

AppHub accepts code changes, documentation improvements, bug reports, and application listings.
Submit changes through a pull request and keep each pull request focused on one change.

## Before contributing

Read the documentation relevant to your change:

- [Catalog documentation](docs/catalog.md) for application listings, assets, sandbox policies, and
  releases.
- [API documentation](docs/api.md) for public endpoint behavior and response structures.
- [Workflow documentation](docs/workflows.md) for validation, catalog maintenance, and deployment.

An application listing consists only of `apps/<slug>.json`. Do not submit downloaded metadata,
images, release files, or changes under `.generated/`. CI generates them from the reviewed sources
in that manifest. Start with the [application template](docs/app.template.json). Every field is
explained in the [catalog documentation](docs/catalog.md). When your branch is ready, open an
[application submission pull request](https://github.com/xlc-dev/apphub/compare/main...HEAD?quick_pull=1&template=app-submission.md)
to use the application checklist.

## Development

AppHub supports Bun and Node.js 22.22.3 or newer. Bun is the primary development environment:

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

The small `pnpm-workspace.yaml` only allows esbuild's required install script. It does not make this
a multi-package workspace.

The main directories are:

- `src/pages/` contains thin website and API routes.
- `src/views/` contains page layouts shared by locale-prefixed routes.
- `src/components/` contains reusable Astro components. Page-level browser behavior lives in
  `src/client/`.
- `src/lib/` contains shared, testable site logic. The catalog loader adapts stored records into the
  published model, and catalog queries derive website and API listings. UI translations live in one
  file per locale under `src/lib/translations/`.
- `apps/` contains one manifest per application.
- `catalog/` owns persisted catalog schemas, storage readers, ingestion, and refresh rules.
- `.generated/` contains the CI-owned catalog, media, releases, and statistics.
- `scripts/` contains catalog refresh, statistics, and validation tooling.
- `tests/` contains the test suite.

Prefer small changes that reuse existing code and dependencies. Add or update tests when behavior
changes.

Run the complete validation before submitting a pull request:

```sh
bun run validate
```

For focused work, use `bun test`, `bun run check`, or `bun run format:check`. Node users can run
`npm run test:node` or `pnpm run test:node`. The other script names are unchanged.

## Pull requests

Explain what changed and why. A pull request adding an application must add only its manifest.
Generated catalog files are committed by the production workflow. Contributor changes to
`.generated/` are rejected.

Continuous integration runs the complete validation for every pull request. Pull requests from
branches in this repository also receive a static preview deployment.
