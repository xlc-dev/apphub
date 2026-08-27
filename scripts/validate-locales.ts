import { access, readFile, readdir } from "node:fs/promises";
import { defaultLocale, localeDefinitions, locales, type Locale } from "#lib/locales";

const otherLocales = locales.filter((locale) => locale !== defaultLocale);

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

let pairs = 0;

for (const locale of otherLocales) {
  const localizedDirectory = `dist${localeDefinitions[locale].path}`;
  const localizedPages = (await readdir(localizedDirectory, { recursive: true })).filter((path) =>
    path.endsWith(".html")
  );

  for (const path of localizedPages) {
    const defaultPage = await readFile(`dist/${path}`, "utf8");
    const localized = await readFile(`dist${localeDefinitions[locale].path}/${path}`, "utf8");

    validatePair(path, locale, defaultPage, localized);
    pairs++;
  }
}

await Promise.all(
  locales.map((locale) => access(`dist${localeDefinitions[locale].path}/search-index.json`))
);

console.log(`Validated ${pairs} localized route pairs.`);
