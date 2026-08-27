import type { APIRoute, GetStaticPaths } from "astro";
import { getArchitectures } from "@/lib/catalog-queries";
import { getApiFacetPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    (await getArchitectures()).map(async ({ id }) => ({
      params: { architecture: id },
      props: { architecture: (await getApiFacetPage("architecture", id))! },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.architecture);
