import type { APIRoute, GetStaticPaths } from "astro";
import { apiRankingSchema, getRanking, type RankingPeriod } from "@/lib/api";
import type { z } from "zod";

type Ranking = z.infer<typeof apiRankingSchema>;

export const prerender = true;

export const getStaticPaths = (async () => {
  const periods: RankingPeriod[] = ["week", "month", "all-time"];

  return Promise.all(
    periods.map(async (period) => ({
      params: { period },
      props: { ranking: await getRanking(period) },
    }))
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ ranking: Ranking }> = ({ props }) => Response.json(props.ranking);
