import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const projectDirectory = pathToFileURL(`${process.cwd()}/`);

export const catalogSnapshotSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.iso.datetime(),
  })
  .strict();

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "validator")
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, stableJson(child)])
    );
  }

  return value;
}

async function addFile(hash: ReturnType<typeof createHash>, path: string, url: URL) {
  hash.update(path);
  hash.update("\0");

  if (!path.endsWith(".webp")) {
    const data = await readFile(url);

    hash.update(
      path.endsWith(".json") ? JSON.stringify(stableJson(JSON.parse(data.toString("utf8")))) : data
    );
  }

  hash.update("\0");
}

async function addDirectory(
  hash: ReturnType<typeof createHash>,
  path: string,
  url: URL
): Promise<void> {
  const entries = (await readdir(url, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name)
  );

  for (const entry of entries) {
    const childPath = `${path}/${entry.name}`;
    const childUrl = new URL(entry.name, url);

    if (entry.isDirectory()) {
      await addDirectory(hash, childPath, new URL(`${entry.name}/`, url));
    } else if (entry.isFile()) {
      await addFile(hash, childPath, childUrl);
    } else {
      throw new Error(`${childPath}: catalog state must contain only files and directories`);
    }
  }
}

export async function calculateCatalogRevision(directory = projectDirectory) {
  const hash = createHash("sha256");

  await addDirectory(hash, "apps", new URL("apps/", directory));
  await addDirectory(hash, ".generated/apps", new URL(".generated/apps/", directory));
  await addDirectory(hash, ".generated/media", new URL(".generated/media/", directory));
  await addFile(hash, ".generated/downloads.json", new URL(".generated/downloads.json", directory));
  await addFile(hash, ".generated/stars.json", new URL(".generated/stars.json", directory));

  return hash.digest("hex");
}

export async function readCatalogSnapshot(directory = projectDirectory) {
  return catalogSnapshotSchema.parse(
    JSON.parse(await readFile(new URL(".generated/snapshot.json", directory), "utf8"))
  );
}
