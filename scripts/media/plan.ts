import { writeFile } from "node:fs/promises";
import { readGitHubPublication } from "#catalog/github-publication";

const repository = process.env.APPHUB_ASSET_REPOSITORY ?? process.env.GITHUB_REPOSITORY;
const planPath = process.env.APPHUB_PUBLICATION_PLAN;

if (!repository) throw new Error("APPHUB_ASSET_REPOSITORY or GITHUB_REPOSITORY is required");
if (!planPath) throw new Error("APPHUB_PUBLICATION_PLAN is required");

const publication = await readGitHubPublication(repository);

await writeFile(planPath, `${JSON.stringify(publication, null, 2)}\n`, { flag: "wx" });
