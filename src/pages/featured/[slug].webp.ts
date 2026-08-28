import { join } from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { readApps } from "#catalog/storage";
import { getCatalogApps, getCatalogSnapshotTime } from "#lib/catalog-loader";
import { featuredApps } from "#lib/featured-apps";

export const prerender = true;

interface Screenshot {
  data: Buffer;
  ratioDifference: number;
}

async function prepareScreenshot(file: string): Promise<Screenshot> {
  const { data, info } = await sharp(join(process.cwd(), ".generated/media", file))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 64 })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    ratioDifference: Math.abs(info.width / info.height - 16 / 10),
  };
}

export const getStaticPaths = (async () => {
  const [apps, entries] = await Promise.all([getCatalogApps(), readApps()]);
  const filesById = new Map(
    entries.map(({ app }) => [app.id, app.screenshots.map(({ file }) => file)])
  );

  return featuredApps(apps, getCatalogSnapshotTime()).map((app) => ({
    params: { slug: app.slug },
    props: { files: filesById.get(app.id)! },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const screenshots = await Promise.all((props.files as string[]).map(prepareScreenshot));
  const source = screenshots.sort(
    (left, right) => left.ratioDifference - right.ratioDifference
  )[0]!;
  const image = await sharp(source.data)
    .resize({ width: 1280, height: 800, fit: "cover", position: "centre" })
    .webp({ quality: 82, effort: 4, smartSubsample: true })
    .toBuffer();

  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/webp" },
  });
};
