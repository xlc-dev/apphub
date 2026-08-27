import type { APIRoute, GetStaticPaths } from "astro";
import { getNewApps } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiNewPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    apiExtraPagePaths((await getNewApps()).apps.length).map(async ({ params, props }) => ({
      params,
      props: { collection: await getApiNewPage(props.page) },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
