export const newAppWindowDays = 30;

export function newApps<T extends { releases: Array<{ publishedAt: string }> }>(
  apps: T[],
  now = new Date()
) {
  const windowStart = now.getTime() - newAppWindowDays * 24 * 60 * 60 * 1000;

  return apps
    .flatMap((app) => {
      const publishedAt = app.releases.at(-1)?.publishedAt;
      const addedAt = publishedAt ? Date.parse(publishedAt) : NaN;

      return addedAt >= windowStart && addedAt <= now.getTime() ? [{ app, addedAt }] : [];
    })
    .sort((left, right) => right.addedAt - left.addedAt)
    .map(({ app }) => app);
}
