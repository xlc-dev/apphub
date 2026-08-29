# Security

AppHub is a static website and JSON API on GitHub Pages. It has no server, database, accounts, or
sessions.

Its Content Security Policy allows scripts, styles, fonts, images, and API requests from the
deployed site. GitHub controls the HTTP headers, so AppHub provides this policy through HTML
metadata. This cannot enforce header-only rules such as `frame-ancestors`.

## Remote catalog data

CI downloads metadata, releases, icons, and screenshots named by app manifests. Pull-request jobs
normally refresh only changed apps and receive no GitHub API token.

Every remote request must:

- Use HTTPS without embedded credentials or custom ports.
- Resolve only to public IP addresses.
- Connect only to a validated address.
- Validate every redirect again.
- Remove caller-provided headers after a cross-origin redirect.
- Stay within request, download, and parser limits.

Production may authenticate to GitHub after code reaches `main`. Pull-request catalog generation
cannot use those credentials.

These controls protect AppHub's build infrastructure. They do not make an upstream AppImage safe to
run. See [Origin and provenance](provenance.md) for what the catalog does and does not guarantee.

Report suspected AppHub vulnerabilities through the private process in
[SECURITY.md](../SECURITY.md).
