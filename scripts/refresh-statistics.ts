import { generateReleases } from "#scripts/update-releases";

await generateReleases();
await import("#scripts/update-downloads");
await import("#scripts/update-stars");
