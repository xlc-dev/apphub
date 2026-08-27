import type { APIRoute, GetStaticPaths } from "astro";
import { getApiApps } from "@/lib/api-resources";
import { getApiAppDetail } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    (await getApiApps()).map(async (app) => ({
      params: { id: app.id },
      props: { app: (await getApiAppDetail(app.id))! },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.app);
