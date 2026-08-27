const selectionSize = 3;

function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));

  const year = day.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((day.getTime() - start.getTime()) / 86_400_000 + 1) / 7);

  return `${year}-W${String(week).padStart(2, "0")}`;
}

function hash(value: string) {
  let result = 2_166_136_261;

  for (let index = 0; index < value.length; index++) {
    result = Math.imul(result ^ value.charCodeAt(index), 16_777_619);
  }

  return result >>> 0;
}

interface AppCandidate {
  id: string;
  categories: string[];
  releases: unknown[];
  screenshots: unknown[];
}

export function featuredApps<T extends AppCandidate>(apps: T[], now: Date) {
  const week = isoWeek(now);
  const candidates = apps
    .filter((app) => app.releases.length > 0 && app.screenshots.length > 0)
    .sort((left, right) => hash(`${week}:${left.id}`) - hash(`${week}:${right.id}`));
  const selected: T[] = [];
  const remaining: T[] = [];
  const categories = new Set<string>();

  for (const app of candidates) {
    const category = app.categories[0];

    if (category && !categories.has(category)) {
      selected.push(app);
      categories.add(category);
    } else {
      remaining.push(app);
    }
  }

  return selected.concat(remaining).slice(0, selectionSize);
}
