import type { APIRoute, GetStaticPaths } from "astro";
import { getApps, type ApiApp } from "@/lib/api";

export const prerender = true;

export const getStaticPaths = (async () =>
  (await getApps()).map((app) => ({
    params: { slug: app.slug },
    props: { app },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ app: ApiApp }> = ({ props }) => Response.json(props.app);
