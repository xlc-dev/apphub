import type { APIRoute } from "astro";
import { getApiCategoryList } from "@/lib/api-v1";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getApiCategoryList());
