import { access, readFile, readdir } from "node:fs/promises";
import { defaultLocale, localeDefinitions, locales, type Locale } from "#lib/locales";

const defaultDirectory = `dist${localeDefinitions[defaultLocale].path}`;
const otherLocales = locales.filter((locale) => locale !== defaultLocale);
const defaultPages = (await readdir(defaultDirectory, { recursive: true })).filter((path) =>
  path.endsWith(".html")
);

function validatePair(path: string, locale: Locale, defaultPage: string, localized: string) {
  if (
    !defaultPage.includes(`<html lang="${defaultLocale}"`) ||
    !localized.includes(`<html lang="${locale}"`)
  ) {
    throw new Error(`${path}: generated pages have incorrect language attributes`);
  }

  for (const page of [defaultPage, localized]) {
    if (locales.some((alternate) => !page.includes(`hreflang="${alternate}"`))) {
      throw new Error(`${path}: generated pages are missing locale alternates`);
    }
  }
}

for (const path of defaultPages) {
  const defaultPage = await readFile(`${defaultDirectory}/${path}`, "utf8");

  for (const locale of otherLocales) {
    const localized = await readFile(`dist${localeDefinitions[locale].path}/${path}`, "utf8");

    validatePair(path, locale, defaultPage, localized);
  }
}

await Promise.all(
  locales.map((locale) => access(`dist${localeDefinitions[locale].path}/search-index.json`))
);

console.log(`Validated ${defaultPages.length * otherLocales.length} localized route pairs.`);
