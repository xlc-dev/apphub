const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function sitePath(path: string) {
  return path.startsWith("/") ? `${base}${path}` : path;
}

export function routePath(path: string) {
  return base && path.startsWith(`${base}/`) ? path.slice(base.length) : path;
}
