import { writeFile } from "node:fs/promises";
import { root } from "@catalog/core";
import { appJsonSchema } from "@catalog/schema";

await writeFile(new URL("app.schema.json", root), `${JSON.stringify(appJsonSchema(), null, 2)}\n`);
