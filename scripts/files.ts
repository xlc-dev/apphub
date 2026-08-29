import { rename, rm, writeFile } from "node:fs/promises";

export function sortRecord<T>(record: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

export async function writeJsonAtomic(path: URL, value: unknown) {
  const temporary = new URL(`${path.href}.tmp-${process.pid}`);

  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
