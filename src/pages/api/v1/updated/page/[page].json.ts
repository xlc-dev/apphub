import type { APIRoute, GetStaticPaths } from "astro";
import { getUpdatedApps } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiUpdatedPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    apiExtraPagePaths((await getUpdatedApps()).apps.length).map(async ({ params, props }) => ({
      params,
      props: { collection: await getApiUpdatedPage(props.page) },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
