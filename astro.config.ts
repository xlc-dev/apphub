import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { defaultLocale, locales } from "./src/lib/locales";
import tailwindcss from "@tailwindcss/vite";

const base = process.env.BASE_PATH ?? "/";
const site = new URL(process.env.SITE_URL ?? "https://xlc-dev.github.io").origin;
export default defineConfig({
  site,
  base,
  build: { inlineStylesheets: "never" },
  markdown: { syntaxHighlight: false },
  i18n: {
    defaultLocale,
    locales: [...locales],
    routing: { prefixDefaultLocale: false },
  },
  security: {
    csp: {
      directives: [
        "base-uri 'none'",
        "connect-src 'self'",
        "default-src 'self'",
        "font-src 'self'",
        "form-action 'self'",
        "img-src 'self' data: https://github.com https://objects.githubusercontent.com https://release-assets.githubusercontent.com",
        "object-src 'none'",
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "#media-loader": fileURLToPath(new URL("./src/lib/media-loader.ts", import.meta.url)),
      },
    },
  },
});
