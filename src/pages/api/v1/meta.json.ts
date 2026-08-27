import type { APIRoute } from "astro";
import { getApiV1Metadata } from "@/lib/api-v1";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getApiV1Metadata());
