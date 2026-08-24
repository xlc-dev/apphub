import type { APIRoute, GetStaticPaths } from "astro";
import { type apiCategoryDetailsSchema, getCategories, getCategory } from "@/lib/api";
import type { z } from "zod";

type CategoryDetails = z.infer<typeof apiCategoryDetailsSchema>;

export const prerender = true;

export const getStaticPaths = (async () => {
  const categories = await getCategories();

  return Promise.all(
    categories.map(async ({ id }) => ({
      params: { category: id },
      props: { category: (await getCategory(id))! },
    }))
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ category: CategoryDetails }> = ({ props }) =>
  Response.json(props.category);
