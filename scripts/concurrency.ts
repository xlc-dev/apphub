export async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  operation: (item: T, index: number) => Promise<void>
) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be positive");

  let next = 0;
  let stopped = false;
  const errors: Array<{ index: number; error: unknown }> = [];

  async function worker() {
    while (!stopped) {
      const index = next++;

      if (index >= items.length) return;

      const item = items[index]!;

      try {
        await operation(item, index);
      } catch (error) {
        errors.push({ index, error });
        stopped = true;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());

  await Promise.all(workers);

  if (errors.length) {
    errors.sort((left, right) => left.index - right.index);
    throw errors[0]!.error;
  }
}
