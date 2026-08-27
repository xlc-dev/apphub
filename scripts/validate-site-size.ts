import { readdir, stat } from "node:fs/promises";

const maximumSize = 850 * 1024 * 1024;

async function directorySize(path: string): Promise<number> {
  let size = 0;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;

    if (entry.isDirectory()) {
      size += await directorySize(child);
    } else if (entry.isFile()) {
      size += (await stat(child)).size;
    } else {
      throw new Error(`${child}: deploy output must contain only files and directories`);
    }
  }

  return size;
}

const size = await directorySize("dist");

if (size > maximumSize) {
  throw new Error(`Published site is ${(size / 1024 / 1024).toFixed(1)} MiB; limit is 850 MiB`);
}

console.log(`Validated ${(size / 1024 / 1024).toFixed(1)} MiB published-site size.`);
