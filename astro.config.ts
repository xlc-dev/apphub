import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

const base = process.env.BASE_PATH ?? "/";

// https://astro.build/config
export default defineConfig({
  site: "https://xlc-dev.github.io",
  base,
  vite: {
    plugins: [tailwindcss()],
  },
});
