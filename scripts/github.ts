const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "AppHub catalog updater",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

export async function githubJson(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`${path}: GitHub returned ${response.status}`);

  return response.json() as Promise<unknown>;
}
