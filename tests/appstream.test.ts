import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDescription, readAppstreamXml } from "#catalog/appstream";
import { mergeFlathubTranslation, readFlathubAppstream, readFlathubAssets } from "#catalog/flathub";
import { localizeApp, normalizeLocale } from "#catalog/localization";

describe("AppStream metadata", () => {
  test("preserves supported description structure", () => {
    assert.deepEqual(
      parseDescription("<p>Use <em>simple</em> <code>text</code>.</p><ul><li>First</li></ul>"),
      [
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Use " },
            { type: "emphasis", value: "simple" },
            { type: "text", value: " " },
            { type: "code", value: "text" },
            { type: "text", value: "." },
          ],
        },
        {
          type: "unordered-list",
          items: [[{ type: "text", value: "First" }]],
        },
      ]
    );
  });

  test("rejects document declarations and custom entities", () => {
    assert.throws(
      () => parseDescription('<!DOCTYPE p [<!ENTITY x "value">]><p>&x;</p>'),
      /must not contain/
    );
  });

  test("rejects malformed and pathological XML", () => {
    assert.throws(() => readAppstreamXml("<component", "org.example.App"), /malformed XML/);
    assert.throws(
      () => parseDescription(`<p>${"<em>".repeat(65)}text${"</em>".repeat(65)}</p>`),
      /nested too deeply/
    );
    assert.throws(
      () =>
        readAppstreamXml(
          `<component type="desktop-application">${"<url/>".repeat(10_001)}</component>`,
          "org.example.App"
        ),
      /too many elements/
    );
  });

  test("decodes standard XML entities", () => {
    assert.deepEqual(parseDescription("<p>A &amp; B</p>"), [
      { type: "paragraph", content: [{ type: "text", value: "A & B" }] },
    ]);
  });

  test("reads a direct MetaInfo document", () => {
    const document = readAppstreamXml(
      `
          <component type="desktop-application">
            <id>org.example.App</id>
            <metadata_license>CC0-1.0</metadata_license>
            <name>Example</name>
            <summary>Do example things</summary>
            <description><p>An example app.</p></description>
            <project_license>MIT</project_license>
            <developer id="org.example"><name>Example Developers</name></developer>
            <icon type="remote">https://example.org/icon.png</icon>
            <url type="homepage">https://example.org/</url>
            <url type="vcs-browser">https://example.org/source</url>
            <url type="bugtracker">https://example.org/issues</url>
            <categories><category>Utility</category></categories>
            <keywords><keyword>example</keyword></keywords>
            <provides><mediatype>text/plain</mediatype></provides>
            <content_rating type="oars-1.1">
              <content_attribute id="violence-cartoon">mild</content_attribute>
              <content_attribute id="social-chat">none</content_attribute>
            </content_rating>
            <screenshots>
              <screenshot type="default">
                <caption>Main window</caption>
                <image type="source">https://example.org/screenshot.png</image>
              </screenshot>
            </screenshots>
          </component>
        `,
      "org.example.App"
    );

    const { metadata } = document;

    assert.deepEqual(
      {
        id: metadata.id,
        name: metadata.name,
        repository: metadata.repository,
        keywords: metadata.keywords,
        mimeTypes: metadata.mimeTypes,
        links: metadata.links,
        contentRating: metadata.contentRating,
      },
      {
        id: "org.example.App",
        name: "Example",
        repository: "https://example.org/source",
        keywords: ["example"],
        mimeTypes: ["text/plain"],
        links: { bugtracker: "https://example.org/issues" },
        contentRating: {
          scheme: "oars-1.1",
          warnings: ["Violence cartoon: mild"],
        },
      }
    );
    assert.deepEqual(document.media, {
      icon: "https://example.org/icon.png",
      screenshots: [{ caption: "Main window", source: "https://example.org/screenshot.png" }],
    });
  });

  test("preserves and resolves localized metadata", () => {
    const { metadata, media } = readAppstreamXml(
      `
        <component type="desktop-application">
          <id>org.example.App</id>
          <metadata_license>CC0-1.0</metadata_license>
          <name>Example</name>
          <name xml:lang="nl">Voorbeeld</name>
          <summary>Do example things</summary>
          <summary xml:lang="nl-NL">Doe voorbeelddingen</summary>
          <description><p>An example app.</p></description>
          <description xml:lang="nl"><p>Een voorbeeldapp.</p></description>
          <project_license>MIT</project_license>
          <developer><name>Example Developers</name><name xml:lang="nl">Voorbeeldontwikkelaars</name></developer>
          <url type="homepage">https://example.org/</url>
          <categories><category>Utility</category></categories>
          <keywords><keyword>example</keyword><keyword xml:lang="nl">voorbeeld</keyword></keywords>
          <screenshots>
            <screenshot>
              <caption>Main window</caption><caption xml:lang="nl">Hoofdvenster</caption>
              <image type="source">https://example.org/screenshot.png</image>
            </screenshot>
          </screenshots>
        </component>`,
      "org.example.App"
    );

    assert.deepEqual(metadata.translations?.nl, {
      name: "Voorbeeld",
      description: [{ type: "paragraph", content: [{ type: "text", value: "Een voorbeeldapp." }] }],
      developerName: "Voorbeeldontwikkelaars",
      keywords: ["voorbeeld"],
    });
    assert.deepEqual(metadata.translations["nl-NL"], { summary: "Doe voorbeelddingen" });
    assert.deepEqual(media.screenshots?.[0]?.captionTranslations, { nl: "Hoofdvenster" });

    const localized = localizeApp(
      {
        ...metadata,
        screenshots: media.screenshots,
      },
      "nl-NL"
    );

    assert.equal(localized.name, "Voorbeeld");
    assert.equal(localized.summary, "Doe voorbeelddingen");
    assert.equal(localized.developer.name, "Voorbeeldontwikkelaars");
    assert.equal(localized.screenshots[0]!.caption, "Hoofdvenster");
  });

  test("normalizes locale tags and rejects malformed values", () => {
    assert.equal(normalizeLocale("nl_nl"), "nl-NL");
    assert.throws(() => normalizeLocale("not a locale"), /Invalid locale tag/);
  });

  test("rejects unsupported component types", () => {
    assert.throws(
      () =>
        readAppstreamXml(
          `
            <component type="addon">
              <id>org.example.Addon</id>
            </component>
          `,
          "org.example.Addon"
        ),
      /expected desktop-application/
    );
  });

  test("rejects pre-1.0 AppStream elements", () => {
    assert.throws(
      () =>
        readAppstreamXml(
          '<component type="desktop-application"><developer_name>Example</developer_name></component>',
          "org.example.App"
        ),
      /developer_name is not supported/
    );
    assert.throws(
      () =>
        readAppstreamXml(
          '<component type="desktop-application"><mimetypes><mimetype>text/plain</mimetype></mimetypes></component>',
          "org.example.App"
        ),
      /mimetypes is not supported/
    );
  });

  test("rejects collection documents", () => {
    assert.throws(
      () =>
        readAppstreamXml(
          `<components><component type="desktop-application" /></components>`,
          "org.example.App"
        ),
      /provide one MetaInfo file/
    );
  });

  test("requires a redistributable metadata license", () => {
    assert.throws(
      () =>
        readAppstreamXml(
          `
            <component type="desktop-application">
              <id>org.example.App</id>
              <metadata_license>GPL-3.0-only</metadata_license>
            </component>
          `,
          "org.example.App"
        ),
      /not suitable for redistribution/
    );
  });

  test("reads Flathub links and content ratings", () => {
    const metadata = readFlathubAppstream({
      id: "org.example.App",
      name: "Example",
      summary: "Do example things",
      description: "<p>An example app.</p>",
      developer_name: "Example Developers",
      project_license: "MIT",
      categories: ["Utility"],
      urls: {
        homepage: "https://example.org/",
        vcs_browser: "https://example.org/source",
        bugtracker: "https://example.org/issues",
        donation: "https://example.org/donate",
      },
      content_rating_details: {
        en_US: {
          minimumAgeText: "Teen",
          contentRatingSystem: "ESRB",
          minimumAge: 13,
          categories: [
            { id: "violence", level: "mild", description: "Mild cartoon violence" },
            { id: "money", level: "none", description: "No ability to spend money" },
          ],
        },
      },
      icon: "https://example.org/icon.png",
      screenshots: [],
    });

    assert.deepEqual(metadata.links, {
      bugtracker: "https://example.org/issues",
      donation: "https://example.org/donate",
    });
    assert.deepEqual(metadata.contentRating, {
      label: "Teen",
      minimumAge: 13,
      warnings: ["Mild cartoon violence"],
    });
  });

  test("merges localized Flathub metadata without duplicating shared data", () => {
    const source = {
      id: "org.example.App",
      name: "Calculator",
      summary: "Perform calculations",
      description: "<p>Calculate things.</p>",
      developer_name: "Example Developers",
      project_license: "MIT",
      categories: ["Utility"],
      keywords: ["calculation"],
      urls: {
        homepage: "https://example.org/",
        vcs_browser: "https://example.org/source",
      },
      icon: "https://example.org/icon.png",
      screenshots: [
        {
          default: true,
          caption: "Basic mode",
          sizes: [
            {
              src: "https://example.org/screenshot_orig.png",
              width: "800",
              height: "600",
            },
          ],
        },
      ],
    };
    const localized = {
      ...source,
      name: "Rekenmachine",
      summary: "Voer berekeningen uit",
      description: "<p>Bereken dingen.</p>",
      screenshots: [{ ...source.screenshots[0]!, caption: "Eenvoudige modus" }],
    };
    const result = mergeFlathubTranslation(
      readFlathubAppstream(source),
      readFlathubAssets(source),
      localized,
      "nl"
    );

    assert.deepEqual(result.metadata.translations, {
      nl: {
        name: "Rekenmachine",
        summary: "Voer berekeningen uit",
        description: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "Bereken dingen." }],
          },
        ],
      },
    });
    assert.deepEqual(result.media.screenshots[0]?.captionTranslations, {
      nl: "Eenvoudige modus",
    });
    assert.equal(result.metadata.projectLicense, "MIT");
  });
});
