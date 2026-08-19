import type { APIRoute } from "astro";
import { getCatalog } from "@/lib/catalog";

export const prerender = true;

export const GET: APIRoute = async () =>
  Response.json({
    version: 1,
    apps: await getCatalog(),
  });
