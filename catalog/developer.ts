const supportedHosts = new Set(["codeberg.org", "github.com", "gitlab.com", "gitlab.gnome.org"]);

export function developerUrl(repository: string | undefined, homepage: string) {
  if (!repository) return homepage;

  const url = new URL(repository);
  const path = url.pathname.split("/").filter(Boolean);

  if (!supportedHosts.has(url.hostname) || path.length < 2) return homepage;

  return `${url.origin}/${path.slice(0, -1).join("/")}`;
}
