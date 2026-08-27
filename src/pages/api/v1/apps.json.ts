import type { APIRoute } from "astro";
import { getApiAppPage } from "@/lib/api-v1";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getApiAppPage());
