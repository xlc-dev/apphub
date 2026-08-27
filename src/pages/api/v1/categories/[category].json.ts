import type { APIRoute, GetStaticPaths } from "astro";
import { getCategories } from "@/lib/catalog-queries";
import { getApiFacetPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    (await getCategories()).map(async ({ id }) => ({
      params: { category: id },
      props: { category: (await getApiFacetPage("category", id))! },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.category);
