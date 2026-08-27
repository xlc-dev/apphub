import type { APIRoute, GetStaticPaths } from "astro";
import { getRanking, type RankingPeriod } from "@/lib/catalog-queries";
import { apiExtraPagePaths, getApiRankingPage } from "@/lib/api-v1";

export const prerender = true;

export const getStaticPaths = (async () => {
  const periods: RankingPeriod[] = ["week", "month", "all-time"];
  const paths = await Promise.all(
    periods.map(async (period) => {
      const total = (await getRanking(period)).entries?.length ?? 0;

      return Promise.all(
        apiExtraPagePaths(total).map(async ({ params, props }) => ({
          params: { period, ...params },
          props: { collection: await getApiRankingPage(period, props.page) },
        }))
      );
    })
  );

  return paths.flat();
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => Response.json(props.collection);
