# Contributing

AppHub accepts code changes, documentation improvements, bug reports, and application listings.
Submit changes through a pull request and keep each pull request focused on one change.

## Before contributing

Read the documentation relevant to your change:

- [Catalog documentation](docs/catalog.md) for application listings, assets, sandbox policies, and
  releases.
- [API documentation](docs/api.md) for public endpoint behavior and response structures.
- [Workflow documentation](docs/workflows.md) for validation, catalog maintenance, and deployment.

Only submit images that may be redistributed under the license recorded for them.

## Development

Install dependencies with:

```sh
bun install --frozen-lockfile
```

The main directories are:

- `src/` contains the website and public API.
- `apps/` contains application manifests, release metadata, and images.
- `catalog/` contains catalog schemas and collected statistics.
- `scripts/` contains release, statistics, and validation tooling.
- `tests/` contains the test suite.

Prefer small changes that reuse existing code and dependencies. Add or update tests when behavior
changes.

Run the complete validation before submitting a pull request:

```sh
bun run validate
```

For focused work, use `bun test`, `bun run check`, or `bun run format:check`.

## Pull requests

Explain what changed and why. Include generated catalog changes such as `releases.json` when the
change requires them, but do not include unrelated formatting or generated files.

Continuous integration runs the complete validation for every pull request. Pull requests from
branches in this repository also receive a static preview deployment.
