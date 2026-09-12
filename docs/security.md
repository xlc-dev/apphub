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

New AppImages are hashed while streaming and are never executed. The refresh worker validates the
ELF class and machine against the catalog architecture, requires the AppImage runtime marker, and
performs bounded structural validation of the embedded ISO9660 or SquashFS archive. Invalid archive
bounds, excessive inode counts, malformed headers, unexpected architectures, and oversized files
fail the release refresh. An artifact without recorded inspection evidence cannot become
installable.

This inspection is defense in depth. It does not prove that the files inside an AppImage are benign,
and it never substitutes for reviewing the application manifest and authenticating its configured
release source.

Refresh workers never mount or extract an AppImage, so archive paths and links are not followed by
AppHub. Any client that inspects an archive must do so in a disposable sandbox and must reject paths
or links that escape its extraction root. Installing an AppImage does not require extracting it.

Production may authenticate to GitHub after code reaches `main`. Pull-request catalog generation
cannot use those credentials.

These controls protect AppHub's build infrastructure. They do not make an upstream AppImage safe to
run. See [Origin and provenance](provenance.md) for what the catalog does and does not guarantee.

Report suspected AppHub vulnerabilities through the private process in
[SECURITY.md](../SECURITY.md).
