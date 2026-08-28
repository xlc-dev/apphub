import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { localizeApp, normalizeLocale } from "#catalog/localization";
import { localePath, stripLocale, translate } from "#lib/i18n";
import { localeDefinitions, locales } from "#lib/locales";

const app = {
  name: "Example",
  summary: "Default summary",
  description: [
    { type: "paragraph" as const, content: [{ type: "text" as const, value: "Default" }] },
  ],
  developer: { name: "Default developer" },
  keywords: ["default"],
  screenshots: [
    {
      caption: "Default caption",
      captionTranslations: { nl: "Nederlands bijschrift" },
    },
  ],
  translations: {
    nl: {
      name: "Voorbeeld",
      developerName: "Nederlandse ontwikkelaar",
    },
    "nl-NL": {
      summary: "Nederlandse samenvatting",
    },
  },
};

describe("localization", () => {
  test("uses exact locale, language, then default values", () => {
    const localized = localizeApp(app, "nl-NL");

    assert.equal(localized.name, "Voorbeeld");
    assert.equal(localized.summary, "Nederlandse samenvatting");
    assert.equal(localized.developer.name, "Nederlandse ontwikkelaar");
    assert.equal(localized.description, app.description);
    assert.equal(localized.screenshots[0]!.caption, "Nederlands bijschrift");
  });

  test("falls back completely when a locale is missing", () => {
    assert.equal(localizeApp(app, "de").name, "Example");
  });

  test("normalizes locale tags and rejects malformed tags", () => {
    assert.equal(normalizeLocale("nl_nl"), "nl-NL");
    assert.throws(() => normalizeLocale("nl/../../"), /Invalid locale tag/);
  });

  test("leaves default-locale URLs unprefixed", () => {
    assert.equal(localePath("/apps/", "en"), "/apps/");
    assert.equal(localePath("/apps/", "nl"), "/nl/apps/");
    assert.equal(stripLocale("/apps/"), "/apps/");
    assert.equal(stripLocale("/nl/apps/"), "/apps/");
  });

  test("derives every localized URL from the locale registry", () => {
    for (const locale of locales) {
      const localized = localePath("/apps/", locale);

      assert.equal(localized, `${localeDefinitions[locale].path}/apps/`);
      assert.equal(stripLocale(localized), "/apps/");
    }
  });

  test("provides Dutch UI messages", () => {
    assert.equal(translate("nl", "pagination.next"), "Volgende");
    assert.equal(translate("nl", "pagination.page", { page: 2, pages: 4 }), "Pagina 2 van 4");
  });
});
