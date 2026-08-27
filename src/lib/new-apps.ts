export const newAppWindowDays = 30;
const collator = new Intl.Collator("en");

export function newApps<T extends { addedAt: string; id?: string; name: string }>(
  apps: T[],
  now: Date
) {
  const windowStart = new Date(now);

  windowStart.setUTCDate(windowStart.getUTCDate() - newAppWindowDays);
  windowStart.setUTCHours(0, 0, 0, 0);

  return apps
    .flatMap((app) => {
      const addedAt = Date.parse(`${app.addedAt}T00:00:00Z`);

      return addedAt >= windowStart.getTime() && addedAt <= now.getTime() ? [{ app, addedAt }] : [];
    })
    .sort(
      (left, right) =>
        right.addedAt - left.addedAt ||
        collator.compare(left.app.name, right.app.name) ||
        collator.compare(left.app.id ?? "", right.app.id ?? "")
    )
    .map(({ app }) => app);
}
