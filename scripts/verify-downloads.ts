import { hashDownload, readApps } from "@catalog/core";

const entries = await readApps();
let count = 0;

for (const { app, lock } of entries) {
  for (const release of lock.releases) {
    for (const artifact of release.artifacts) {
      const calculated = await hashDownload(artifact);

      if (calculated.sha256 !== artifact.sha256)
        throw new Error(`${app.id} ${release.version}: ${artifact.name} checksum differs`);

      count++;
    }
  }
}

console.log(`Verified ${count} artifact download${count === 1 ? "" : "s"}.`);
