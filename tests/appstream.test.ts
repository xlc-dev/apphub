import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDescription, readAppstreamXml, readFlathubAppstream } from "#catalog/appstream";

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

  test("decodes standard XML entities", () => {
    assert.deepEqual(parseDescription("<p>A &amp; B</p>"), [
      { type: "paragraph", content: [{ type: "text", value: "A & B" }] },
    ]);
  });

  test("reads a direct MetaInfo document", () => {
    const metadata = readAppstreamXml(
      `
          <component type="desktop-application">
            <id>org.example.App</id>
            <name>Example</name>
            <summary>Do example things</summary>
            <description><p>An example app.</p></description>
            <project_license>MIT</project_license>
            <developer><name>Example Developers</name></developer>
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
          </component>
        `,
      "org.example.App"
    );

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
          attributes: { "violence-cartoon": "mild", "social-chat": "none" },
        },
      }
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
      ratingSystem: "ESRB",
      rating: "Teen",
      minimumAge: 13,
      warnings: ["Mild cartoon violence"],
    });
  });
});
