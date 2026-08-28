# Security

AppHub publishes a static website and JSON API through GitHub Pages. It has no runtime application
server, database, accounts, sessions, or server-side request handling. GitHub controls the HTTP
response headers. AppHub therefore emits its browser Content Security Policy as HTML metadata using
Astro.

The policy permits scripts, styles, fonts, images, and API requests only from the deployed site,
apart from embedded image data. Astro hashes generated scripts and styles. The policy also disables
plugins and prevents injected base URLs. A metadata policy cannot enforce header-only directives
such as `frame-ancestors`, so GitHub Pages cannot provide every policy available to a server AppHub
controls.

## Remote catalog data

Application manifests can cause CI to fetch AppStream metadata, release feeds, icons, screenshots,
and provider API resources. Pull-request CI fetches data referenced by schema-valid manifests. It
normally refreshes only changed manifests. Generator or schema changes may refresh the full catalog.
Pull-request generation receives no GitHub API token.

Every remote request must:

- use HTTPS without embedded credentials or a custom port.
- resolve exclusively to public IP addresses.
- connect only to an address from that validated result.
- repeat validation and address pinning after every redirect.
- discard all caller-provided headers on a cross-origin redirect.
- remain within redirect, timeout, response, download, and parser limits.

Production refreshes may authenticate to the GitHub API. Those credentials are used only by trusted
code after changes reach `main`. They are not available to application pull-request generation.

These controls protect AppHub's build infrastructure. They do not make an upstream AppImage safe to
run. See [Origin and provenance](provenance.md) for what the catalog does and does not guarantee.

Report suspected AppHub vulnerabilities through the private process in
[SECURITY.md](../SECURITY.md).
