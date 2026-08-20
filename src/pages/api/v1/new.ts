import type { APIRoute } from "astro";
import { getNewApps } from "@/lib/api";

export const prerender = true;

export const GET: APIRoute = async () => Response.json(await getNewApps());
