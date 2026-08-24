import type { APIRoute, GetStaticPaths } from "astro";
import { getApiApps } from "@/lib/api";

export const prerender = true;

export const getStaticPaths = (async () =>
  (await getApiApps()).map((app) => ({
    params: { id: app.id },
    props: { app },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.app);
