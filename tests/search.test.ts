import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  catalogSearchValue,
  appInterface,
  directFilesystemAccess,
  displayBackends,
  hostAccess,
  isAnyLinuxArtifact,
  matchesCatalogFilters,
  matchesSearch,
  searchCardSelectors,
  searchPage,
  type SearchIndexEntry,
} from "#lib/search";

const app = {
  name: "Example Notes",
  summary: "Organize ideas locally",
  description: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, value: "An offline plain-text notebook" }],
    },
  ],
  developer: { name: "Example Developers" },
  keywords: ["notes", "writing"],
  categories: ["Office", "Utility"],
  mimeTypes: ["text/plain"],
  origin: { type: "third-party" as const },
};

const value = catalogSearchValue(app);

function entry(name: string, value: string): SearchIndexEntry {
  return {
    slug: name.toLowerCase(),
    name,
    summary: `${name} summary`,
    origin: "third-party",
    categories: ["Utility"],
    architectures: ["x86_64"],
    compatibility: ["anylinux"],
    display: ["wayland", "x11"],
    filesystemLocations: ["home"],
    hostAccess: ["ipc"],
    license: "MIT",
    interface: "graphical",
    network: "none",
    filesystem: "none",
    audio: "none",
    process: "isolated",
    devices: ["gpu"],
    portals: ["file-chooser"],
    icon: { url: `${name}.webp` },
    value,
  };
}

describe("catalog search", () => {
  const filters = {
    categories: [],
    architecture: [],
    compatibility: [],
    origin: [],
    license: [],
    interface: [],
    display: [],
    network: [],
    filesystem: [],
    location: [],
    audio: [],
    process: [],
    host: [],
    device: [],
    portal: [],
  };

  test("includes all searchable app metadata", () => {
    assert.match(value, /example notes/);
    assert.match(value, /organize ideas locally/);
    assert.match(value, /offline plain-text notebook/);
    assert.match(value, /office utility/);
    assert.match(value, /example developers/);
    assert.match(value, /notes writing/);
    assert.match(value, /text\/plain/);
    assert.match(value, /third-party/);
  });

  test("matches case-insensitively", () => {
    assert.equal(matchesSearch(value, "EXAMPLE"), true);
  });

  test("matches substrings from the first character", () => {
    assert.equal(matchesSearch("silvermarsh credential vault", "s"), true);
    assert.equal(matchesSearch("silvermarsh credential vault", "marsh"), true);
  });

  test("does not fuzzily match ordered characters", () => {
    assert.equal(matchesSearch("silvermarsh credential vault", "slvrmrsh"), false);
    assert.equal(matchesSearch("alternatives", "lev"), false);
  });

  test("matches multiple terms in any order", () => {
    assert.equal(matchesSearch(value, "utility offline"), true);
    assert.equal(matchesSearch(value, "offline missing"), false);
  });

  test("matches an empty query", () => {
    assert.equal(matchesSearch(value, "  "), true);
  });

  test("derives direct filesystem access", () => {
    assert.equal(directFilesystemAccess([]), "none");
    assert.equal(directFilesystemAccess([{ access: "read-only" }]), "read-only");
    assert.equal(
      directFilesystemAccess([{ access: "read-only" }, { access: "read-write" }]),
      "read-write"
    );
  });

  test("derives the application interface from display access", () => {
    assert.equal(appInterface("none"), "terminal");
    assert.equal(appInterface("wayland-and-x11"), "graphical");
    assert.deepEqual(displayBackends("none"), []);
    assert.deepEqual(displayBackends("wayland"), ["wayland"]);
    assert.deepEqual(displayBackends("wayland-and-x11"), ["wayland", "x11"]);
  });

  test("derives aggregate host access", () => {
    assert.deepEqual(hostAccess({ ipc: false, sessionBus: [], systemBus: [] }), ["none"]);
    assert.deepEqual(
      hostAccess({
        ipc: true,
        sessionBus: [{ name: "org.example.Session", access: "talk" }],
        systemBus: [{ name: "org.example.System", access: "see" }],
      }),
      ["ipc", "session-bus", "system-bus"]
    );
  });

  test("recognizes AnyLinux artifacts", () => {
    assert.equal(isAnyLinuxArtifact("Example-1.0-anylinux-x86_64.AppImage"), true);
    assert.equal(isAnyLinuxArtifact("Example-1.0-x86_64.AppImage"), false);
    assert.equal(isAnyLinuxArtifact("Example-notanylinux-x86_64.AppImage"), false);
  });

  test("matches any value within a filter and every active filter", () => {
    const candidate = entry("One", "editor");

    assert.equal(
      matchesCatalogFilters(candidate, {
        ...filters,
        architecture: ["aarch64", "x86_64"],
        compatibility: ["anylinux"],
        origin: ["third-party"],
        license: ["MIT"],
        interface: ["graphical"],
        display: ["wayland"],
        network: ["none"],
        filesystem: ["none"],
        location: ["home"],
        audio: ["none"],
        process: ["isolated"],
        host: ["ipc"],
        device: ["usb", "gpu"],
        portal: ["file-chooser"],
      }),
      true
    );
    assert.equal(matchesCatalogFilters(candidate, { ...filters, network: ["client"] }), false);
    assert.equal(matchesCatalogFilters(candidate, { ...filters, host: ["system-bus"] }), false);
    assert.equal(
      matchesCatalogFilters({ ...candidate, devices: ["none"] }, { ...filters, device: ["none"] }),
      true
    );
  });

  test("paginates filtered results", () => {
    const index = [
      entry("One", "editor text"),
      entry("Two", "editor image"),
      entry("Three", "editor audio"),
      entry("Four", "game"),
    ];

    assert.deepEqual(searchPage(index, "editor", filters, 2, 2), {
      apps: [index[2]],
      page: 2,
      pages: 2,
      total: 3,
    });
  });

  test("bounds search result pages", () => {
    const index = [entry("One", "editor")];

    assert.equal(searchPage(index, "editor", filters, 20).page, 1);
    assert.deepEqual(searchPage(index, "missing", filters, 1), {
      apps: [],
      page: 1,
      pages: 1,
      total: 0,
    });
  });

  test("keeps dynamic search bindings on the shared card components", async () => {
    const sources = await Promise.all([
      readFile(new URL("../src/components/AppCard.astro", import.meta.url), "utf8"),
      readFile(new URL("../src/components/SourceBadge.astro", import.meta.url), "utf8"),
    ]);
    const source = sources.join("\n");

    for (const selector of Object.values(searchCardSelectors)) {
      assert.match(source, new RegExp(selector.slice(1, -1)));
    }
  });
});
