import type { APIRoute, GetStaticPaths } from "astro";
import { mediaBytes, unpublishedMediaFiles } from "#media-loader";

export const prerender = true;

export const getStaticPaths = (() =>
  unpublishedMediaFiles().map((name) => ({
    params: { file: name.replace(/\.webp$/, "") },
    props: { name },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await mediaBytes(props.name as string)), {
    headers: { "Content-Type": "image/webp" },
  });
