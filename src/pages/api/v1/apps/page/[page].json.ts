import type { APIRoute, GetStaticPaths } from "astro";
import { getAppSummaries } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiAppPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    apiExtraPagePaths((await getAppSummaries()).length).map(async ({ params, props }) => ({
      params,
      props: { collection: await getApiAppPage(props.page) },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
