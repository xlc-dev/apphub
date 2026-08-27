import type { APIRoute, GetStaticPaths } from "astro";
import { getArchitecture, getArchitectures } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiFacetPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () => {
  const paths = await Promise.all(
    (await getArchitectures()).map(async ({ id }) => {
      const total = (await getArchitecture(id))!.apps.length;

      return Promise.all(
        apiExtraPagePaths(total).map(async ({ params, props }) => ({
          params: { architecture: id, ...params },
          props: { collection: await getApiFacetPage("architecture", id, props.page) },
        }))
      );
    })
  );

  return paths.flat();
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
