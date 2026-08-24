import type { APIRoute } from "astro";
import { getApiMetadata } from "@/lib/api";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getApiMetadata());
