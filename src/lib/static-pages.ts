import { getNewApps, getRanking, type RankingPeriod } from "@/lib/api";
import { catalogPageSize } from "@/lib/pagination";

function pagePaths(total: number) {
  const pages = Math.ceil(total / catalogPageSize);

  return Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({
    params: { page: String(index + 2) },
    props: { page: index + 2 },
  }));
}

export async function newAppPagePaths() {
  return pagePaths((await getNewApps()).apps.length);
}

export async function rankingPagePaths(period: RankingPeriod) {
  return pagePaths((await getRanking(period)).entries?.length ?? 0);
}
