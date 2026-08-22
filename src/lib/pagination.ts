export function paginationState(total: number, requestedPage: number, pageSize = 24) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Number.isInteger(requestedPage) ? requestedPage : 1, 1), pages);

  return {
    page,
    pages,
    start: (page - 1) * pageSize,
    end: Math.min(page * pageSize, total),
  };
}
