import type { APIRoute } from "astro";
import { apiV1JsonSchema } from "@/lib/api-v1-schema";

export const prerender = true;

export const GET: APIRoute = () => Response.json(apiV1JsonSchema);
