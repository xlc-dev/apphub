import type { APIRoute, GetStaticPaths } from "astro";
import { readFile, readdir } from "node:fs/promises";

const generated = new URL("../../../../../.generated/tuf/", import.meta.url);
const trust = new URL("../../../../../trust/", import.meta.url);

async function optionalFiles(directory: URL) {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export const getStaticPaths = (async () => {
  const files = [...(await optionalFiles(generated)), ...(await optionalFiles(trust))];

  return [...new Set(files)].map((file) => ({ params: { file } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const file = params.file;
  if (!file || !/^[a-f0-9.-]+\.json$/.test(file)) return new Response(null, { status: 404 });

  const directory = file === "root.json" || file === "revocations.json" ? trust : generated;

  return new Response(await readFile(new URL(file, directory)), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
