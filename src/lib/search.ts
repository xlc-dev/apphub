import type { DescriptionBlock } from "#catalog/schema";
import type { CatalogApp } from "#lib/catalog-model";
import { catalogPageSize, paginationState } from "#lib/pagination";

interface SearchableApp {
  name: string;
  summary: string;
  description: DescriptionBlock[];
  developer: { name: string };
  keywords?: string[] | undefined;
  categories: string[];
  mimeTypes?: string[] | undefined;
  origin: { type: "upstream" | "third-party" };
}

export interface SearchIndexEntry {
  slug: string;
  name: string;
  summary: string;
  origin: "upstream" | "third-party";
  categories: string[];
  architectures: string[];
  compatibility: string[];
  display: DisplayBackend[];
  filesystemLocations: string[];
  hostAccess: HostAccess[];
  license: string;
  interface: AppInterface;
  network: string;
  filesystem: DirectFilesystemAccess;
  audio: string;
  process: string;
  devices: string[];
  stars?: number | undefined;
  icon: { url: string };
  value: string;
}

export interface CatalogFilters {
  categories: string[];
  architecture: string[];
  compatibility: string[];
  origin: string[];
  license: string[];
  interface: string[];
  display: string[];
  network: string[];
  filesystem: string[];
  location: string[];
  audio: string[];
  process: string[];
  host: string[];
  device: string[];
}

export const catalogFilterParameters = [
  "architecture",
  "compatibility",
  "origin",
  "license",
  "interface",
  "display",
  "network",
  "filesystem",
  "location",
  "audio",
  "process",
  "host",
  "device",
] as const;
export const compatibilityFilterValues = ["anylinux"] as const;
export const displayFilterValues = ["wayland", "x11"] as const;
export const hostAccessFilterValues = ["none", "ipc", "session-bus", "system-bus"] as const;
export const networkFilterValues = ["none", "full"] as const;
export const filesystemFilterValues = ["none", "read-only", "read-write"] as const;
export const interfaceFilterValues = ["graphical", "terminal"] as const;
export const audioFilterValues = ["none", "full"] as const;
export const processFilterValues = ["isolated", "full"] as const;
type DirectFilesystemAccess = (typeof filesystemFilterValues)[number];
type AppInterface = (typeof interfaceFilterValues)[number];
type DisplayBackend = (typeof displayFilterValues)[number];
type HostAccess = (typeof hostAccessFilterValues)[number];

export const searchCardSelectors = {
  link: "[data-app-card-link]",
  icon: "[data-app-card-icon]",
  name: "[data-app-card-name]",
  summary: "[data-app-card-summary]",
  origin: "[data-origin-badge]",
  originLabel: "[data-origin-label]",
  categories: "[data-app-card-categories]",
  categoryCount: "[data-app-card-category-count]",
  stars: "[data-app-card-stars]",
  starCount: "[data-app-card-star-count]",
} as const;

export function catalogSearchValue(app: SearchableApp) {
  const description = app.description.flatMap((block) =>
    block.type === "paragraph" ? block.content : block.items.flat()
  );

  return [
    app.name,
    app.summary,
    ...description.map(({ value }) => value),
    app.developer.name,
    app.origin.type,
    ...app.categories,
    ...(app.keywords ?? []),
    ...(app.mimeTypes ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesSearch(value: string, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/);

  return terms[0] === "" || terms.every((term) => value.includes(term));
}

export function directFilesystemAccess(
  rules: Array<{ access: "read-only" | "read-write" }>
): DirectFilesystemAccess {
  if (rules.some(({ access }) => access === "read-write")) return "read-write";

  return rules.length > 0 ? "read-only" : "none";
}

export function appInterface(display: string): AppInterface {
  return display === "none" ? "terminal" : "graphical";
}

export function displayBackends(display: string): DisplayBackend[] {
  if (display === "wayland-or-x11") return ["wayland", "x11"];
  if (display === "wayland" || display === "x11") return [display];

  return [];
}

export function hostAccess(
  sandbox: Pick<CatalogApp["sandbox"], "ipc" | "sessionBus" | "systemBus">
): HostAccess[] {
  const access: HostAccess[] = [];

  if (sandbox.ipc) access.push("ipc");
  if (sandbox.sessionBus.access !== "none") access.push("session-bus");
  if (sandbox.systemBus.access !== "none") access.push("system-bus");

  return access.length > 0 ? access : ["none"];
}

export function isAnyLinuxArtifact(name: string) {
  return /(?:^|[^a-z0-9])anylinux(?:[^a-z0-9]|$)/i.test(name);
}

export function hasAnyLinuxBuild(app: Pick<CatalogApp, "releases">) {
  return app.releases[0]?.artifacts.some(({ name }) => isAnyLinuxArtifact(name)) ?? false;
}

function matchesAny(selected: string[], values: string[]) {
  return selected.length === 0 || selected.some((value) => values.includes(value));
}

export function matchesCatalogFilters(app: SearchIndexEntry, filters: CatalogFilters) {
  return (
    matchesAny(filters.categories, app.categories) &&
    matchesAny(filters.architecture, app.architectures) &&
    matchesAny(filters.compatibility, app.compatibility) &&
    matchesAny(filters.origin, [app.origin]) &&
    matchesAny(filters.license, [app.license]) &&
    matchesAny(filters.interface, [app.interface]) &&
    matchesAny(filters.display, app.display) &&
    matchesAny(filters.network, [app.network]) &&
    matchesAny(filters.filesystem, [app.filesystem]) &&
    matchesAny(filters.location, app.filesystemLocations) &&
    matchesAny(filters.audio, [app.audio]) &&
    matchesAny(filters.process, [app.process]) &&
    matchesAny(filters.host, app.hostAccess) &&
    matchesAny(filters.device, app.devices)
  );
}

export function searchPage(
  index: SearchIndexEntry[],
  query: string,
  filters: CatalogFilters,
  requestedPage: number,
  pageSize = catalogPageSize
) {
  const matches = index.filter(
    (app) => matchesSearch(app.value, query) && matchesCatalogFilters(app, filters)
  );
  const state = paginationState(matches.length, requestedPage, pageSize);

  return {
    apps: matches.slice(state.start, state.end),
    page: state.page,
    pages: state.pages,
    total: matches.length,
  };
}

export function searchIndexEntry(app: CatalogApp, stars?: number): SearchIndexEntry {
  return {
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    origin: app.origin.type,
    categories: app.categories,
    architectures: app.releases[0]?.artifacts.map(({ architecture }) => architecture) ?? [],
    compatibility: hasAnyLinuxBuild(app) ? ["anylinux"] : [],
    display: displayBackends(app.sandbox.display),
    filesystemLocations: app.sandbox.filesystem.map(({ location }) => location),
    hostAccess: hostAccess(app.sandbox),
    license: app.projectLicense,
    interface: appInterface(app.sandbox.display),
    network: app.sandbox.network,
    filesystem: directFilesystemAccess(app.sandbox.filesystem),
    audio: app.sandbox.audio,
    process: app.sandbox.processes,
    devices: app.sandbox.devices.length > 0 ? app.sandbox.devices : ["none"],
    stars,
    icon: { url: app.icon.url },
    value: catalogSearchValue(app),
  };
}
