import type { APIRoute, GetStaticPaths } from "astro";
import { getCategories, getCategory } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiFacetPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () => {
  const paths = await Promise.all(
    (await getCategories()).map(async ({ id }) => {
      const total = (await getCategory(id))!.apps.length;

      return Promise.all(
        apiExtraPagePaths(total).map(async ({ params, props }) => ({
          params: { category: id, ...params },
          props: { collection: await getApiFacetPage("category", id, props.page) },
        }))
      );
    })
  );

  return paths.flat();
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
