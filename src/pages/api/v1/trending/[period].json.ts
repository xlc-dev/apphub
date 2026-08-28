import type { APIRoute, GetStaticPaths } from "astro";
import { getApiRankingPage } from "@/lib/api-v1";
import type { RankingPeriod } from "@/lib/catalog-model";

export const prerender = true;

export const getStaticPaths = (async () => {
  const periods: RankingPeriod[] = ["week", "month", "all-time"];

  return Promise.all(
    periods.map(async (period) => ({
      params: { period },
      props: { ranking: await getApiRankingPage(period) },
    }))
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.ranking);
