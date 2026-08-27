import type { APIRoute } from "astro";
import { getApiUpdatedPage } from "@/lib/api-v1";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getApiUpdatedPage());
