export const newAppWindowDays = 30;

export function newApps<T extends { addedAt: string }>(apps: T[], now = new Date()) {
  const windowStart = new Date(now);

  windowStart.setUTCDate(windowStart.getUTCDate() - newAppWindowDays);
  windowStart.setUTCHours(0, 0, 0, 0);

  return apps
    .flatMap((app) => {
      const addedAt = Date.parse(`${app.addedAt}T00:00:00Z`);

      return addedAt >= windowStart.getTime() && addedAt <= now.getTime()
        ? [{ app, addedAt }]
        : [];
    })
    .sort((left, right) => right.addedAt - left.addedAt)
    .map(({ app }) => app);
}
