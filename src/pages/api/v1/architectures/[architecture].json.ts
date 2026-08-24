import type { APIRoute, GetStaticPaths } from "astro";
import { apiArchitectureDetailsSchema, getArchitecture, getArchitectures } from "@/lib/api";
import type { z } from "zod";

type ArchitectureDetails = z.infer<typeof apiArchitectureDetailsSchema>;

export const prerender = true;

export const getStaticPaths = (async () =>
  Promise.all(
    (await getArchitectures()).map(async ({ id }) => ({
      params: { architecture: id },
      props: { architecture: (await getArchitecture(id))! },
    }))
  )) satisfies GetStaticPaths;

export const GET: APIRoute<{ architecture: ArchitectureDetails }> = ({ props }) =>
  Response.json(props.architecture);
